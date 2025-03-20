class CalendarAssistant {
    constructor() {
        console.log("CalendarAssistant initialized");
        this.apiKey =
            "api-key-here";
        this.initializeElements();
        this.addEventListeners();
        this.loadSavedState();
        this.setupMessageListener();
    }

    setupMessageListener() {
        console.log("Setting up message listener");
        chrome.runtime.onMessage.addListener(
            (request, sender, sendResponse) => {
                console.log("Message received:", request);
                if (request.action === "analyzeContent") {
                    console.log("Analyzing content from message");
                    if (request.content) {
                        this.textInput.value = request.content;
                    } else if (request.imageUrl) {
                        this.imageInput.value = request.imageUrl;
                    }
                    this.analyzeContent();
                }
            }
        );
    }

    initializeElements() {
        this.textInput = document.getElementById("textInput");
        this.imageInput = document.getElementById("imageInput");
        this.analyzeBtn = document.getElementById("analyzeBtn");
        this.result = document.getElementById("result");
        this.eventDetails = document.getElementById("eventDetails");
    }

    addEventListeners() {
        this.analyzeBtn.addEventListener("click", () => this.analyzeContent());

        this.textInput.addEventListener("input", () => this.saveState());
        this.imageInput.addEventListener("input", () => this.saveState());
    }

    async analyzeContent() {
        console.log("Starting content analysis");
        const content = this.textInput.value;
        const imageUrl = this.imageInput.value;

        if (!content && !imageUrl) {
            console.log("No content to analyze");
            return;
        }

        this.setLoading(true);
        try {
            let eventInfo;
            if (imageUrl) {
                console.log("Analyzing image URL:", imageUrl);
                eventInfo = await this.extractEventInfoFromImage(imageUrl);
                if (content) {
                    if (Array.isArray(eventInfo)) {
                        eventInfo.forEach((event) => {
                            event.description = `${content}\n\n${
                                event.description || ""
                            }`.trim();
                        });
                    } else {
                        eventInfo.description = `${content}\n\n${
                            eventInfo.description || ""
                        }`.trim();
                    }
                }
            } else {
                eventInfo = await this.extractEventInfo(content);
            }
            this.currentEventInfo = eventInfo;
            this.displayEventInfo(eventInfo);
            await this.saveState();
        } catch (error) {
            console.error("Error analyzing content:", error);
            console.error("Error details:", error.details);
            alert(`Error analyzing content: ${error.message}`);
        } finally {
            this.setLoading(false);
        }
    }

    async extractEventInfo(content) {
        try {
            const response = await fetch(
                "https://api.openai.com/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gpt-4o",
                        messages: [
                            {
                                role: "user",
                                content: content,
                            },
                        ],
                        functions: [
                            {
                                name: "extract_events",
                                description:
                                    "Extract event information from text",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        events: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                properties: {
                                                    title: {
                                                        type: "string",
                                                        description:
                                                            "The title of the event",
                                                    },
                                                    description: {
                                                        type: "string",
                                                        description:
                                                            "Description of the event",
                                                    },
                                                    start_time: {
                                                        type: "string",
                                                        format: "date-time",
                                                        description:
                                                            "Start time in ISO 8601 format (YYYY-MM-DDTHH:mm:ss)",
                                                    },
                                                    end_time: {
                                                        type: "string",
                                                        format: "date-time",
                                                        description:
                                                            "End time in ISO 8601 format (YYYY-MM-DDTHH:mm:ss)",
                                                    },
                                                    location: {
                                                        type: "string",
                                                        description:
                                                            "Location of the event",
                                                    },
                                                    timezone: {
                                                        type: "string",
                                                        description:
                                                            "Timezone of the event (e.g., 'America/New_York')",
                                                    },
                                                },
                                                required: [
                                                    "title",
                                                    "start_time",
                                                    "end_time",
                                                    "location",
                                                ],
                                            },
                                        },
                                    },
                                    required: ["events"],
                                },
                            },
                        ],
                        function_call: {name: "extract_events"},
                    }),
                }
            );

            const data = await response.json();
            console.log("OpenAI API Response:", data);

            if (!response.ok) {
                throw new Error(
                    `API Error: ${data.error?.message || "Unknown error"}`
                );
            }

            if (!data.choices?.[0]?.message?.function_call) {
                throw new Error("Invalid response structure from OpenAI API");
            }

            try {
                const functionCall = data.choices[0].message.function_call;
                const eventInfo = JSON.parse(functionCall.arguments);
                console.log("Parsed event info:", eventInfo);

                // Validate and format each event
                const formattedEvents = eventInfo.events.map((event) => ({
                    ...event,
                    description: event.description || "",
                    start_time: this.ensureValidDate(event.start_time),
                    end_time: this.ensureValidDate(event.end_time),
                    timezone: event.timezone || "UTC",
                }));

                return formattedEvents;
            } catch (parseError) {
                console.error(
                    "Raw API response content:",
                    data.choices[0].message.function_call
                );
                throw new Error(
                    `Failed to parse event information: ${parseError.message}`
                );
            }
        } catch (error) {
            console.error("Full error:", error);
            throw error;
        }
    }

    ensureValidDate(dateStr) {
        try {
            // Try to parse the date
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) {
                // If invalid, return current date/time
                return new Date().toISOString();
            }
            return date.toISOString();
        } catch (error) {
            // If parsing fails, return current date/time
            return new Date().toISOString();
        }
    }

    formatDateTime(dateTimeStr) {
        try {
            const date = new Date(dateTimeStr);
            if (isNaN(date.getTime())) throw new Error("Invalid date");
            return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        } catch (error) {
            console.error("Date formatting error:", error);
            return (
                new Date().toISOString().replace(/[-:]/g, "").split(".")[0] +
                "Z"
            );
        }
    }

    formatDateTimeICS(dateTimeStr) {
        try {
            const date = new Date(dateTimeStr);
            if (isNaN(date.getTime())) throw new Error("Invalid date");
            return date.toISOString();
        } catch (error) {
            console.error("ICS date formatting error:", error);
            return new Date().toISOString();
        }
    }

    displayEventInfo(eventInfoArray) {
        const events = Array.isArray(eventInfoArray) ? eventInfoArray : [eventInfoArray];
        
        this.eventDetails.innerHTML = events.map((event, index) => {
            const locationHtml = event.location.includes('http')
                ? `<a href="${event.location}" target="_blank">Join Meeting</a>`
                : event.location;

            const descriptionHtml = event.description
                .split('\n')
                .map(line => {
                    if (line.startsWith('Start:') || line.startsWith('End:')) {
                        return null;
                    }
                    const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
                    if (urlMatch) {
                        const url = urlMatch[1];
                        let platform = line.split(':')[0].trim();
                        return `${platform}: <a href="${url}" target="_blank">${url}</a>`;
                    }
                    return line;
                })
                .filter(line => line !== null)
                .join('<br>');

            const startDate = new Date(event.start_time);
            const endDate = new Date(event.end_time);
            
            const formatDate = (date) => {
                return date.toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            };

            return `
                <div class="event-card" data-event-index="${index}">
                    <h3>${event.title}</h3>
                    <div class="event-links">${descriptionHtml}</div>
                    <p>Start: ${formatDate(startDate)}</p>
                    <p>End: ${formatDate(endDate)}</p>
                    <p>Location: ${locationHtml}</p>
                    <div class="calendar-options">
                        <button class="calendar-option" data-calendar="google" data-event-index="${index}" title="Add to Google Calendar">
                            <img src="../assets/icons/google-calendar.svg" alt="Google Calendar">
                        </button>
                        <button class="calendar-option" data-calendar="ical" data-event-index="${index}" title="Add to Apple Calendar">
                            <img src="../assets/icons/Apple_Calendar_(iOS).svg" alt="Apple Calendar">
                        </button>
                        <button class="calendar-option" data-calendar="outlook" data-event-index="${index}" title="Add to Outlook">
                            <img src="../assets/icons/microsoft-outlook.svg" alt="Outlook">
                        </button>
                        <button class="calendar-option" data-calendar="notion" data-event-index="${index}" title="Add to Notion">
                            <img src="../assets/icons/notion.svg" alt="Notion">
                        </button>
                    </div>
                </div>
            `;
        }).join('<hr>');

        // Add event listeners for calendar buttons
        const buttons = this.eventDetails.querySelectorAll('.calendar-option');
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                const calendarType = e.currentTarget.dataset.calendar;
                const eventIndex = parseInt(e.currentTarget.dataset.eventIndex);
                const selectedEvent = events[eventIndex];
                this.addToCalendar(calendarType, selectedEvent);
            });
        });

        this.result.classList.remove("hidden");
    }

    addToCalendar(calendarType, event) {
        if (!event) {
            console.error('No event provided');
            return;
        }

        console.log('Adding to calendar:', calendarType, event);

        const eventData = {
            title: encodeURIComponent(event.title),
            description: encodeURIComponent(event.description),
            location: encodeURIComponent(event.location),
            start: this.formatDateTime(event.start_time),
            end: this.formatDateTime(event.end_time)
        };

        switch (calendarType) {
            case 'google':
                const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventData.title}&details=${eventData.description}&location=${eventData.location}&dates=${eventData.start}/${eventData.end}`;
                window.open(googleUrl, '_blank');
                break;

            case 'outlook':
                const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${eventData.title}&body=${eventData.description}&location=${eventData.location}&startdt=${event.start_time}&enddt=${event.end_time}`;
                window.open(outlookUrl, '_blank');
                break;

            case 'ical':
            case 'notion':
                try {
                    const cal = new ics();
                    cal.addEvent(
                        decodeURIComponent(eventData.title),
                        decodeURIComponent(eventData.description),
                        decodeURIComponent(eventData.location),
                        this.formatDateTimeICS(event.start_time),
                        this.formatDateTimeICS(event.end_time)
                    );
                    const filename = calendarType === 'notion' ? 
                        `notion_${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}` :
                        event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    cal.download(filename);
                } catch (error) {
                    console.error('Error creating ICS file:', error);
                    alert('Error creating calendar file. Please try again.');
                }
                break;
        }
    }

    async extractEventInfoFromImage(imageUrl) {
        try {
            const response = await fetch(
                "https://api.openai.com/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gpt-4o",
                        messages: [
                            {
                                role: "system",
                                content:
                                    "You are an event information extractor. For online meetings, always put the primary video conferencing URL (Zoom/Google Meet) in the location field. Never just put 'Zoom' or 'Online' - always include the full URL.",
                            },
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text:
                                            "Extract event information from this image with these specific rules:\n" +
                                            "1. For online meetings:\n" +
                                            "   - LOCATION field must contain the full video conferencing URL (Zoom/Google Meet)\n" +
                                            "   - If multiple video URLs exist, put the primary one in location\n" +
                                            "2. For in-person events:\n" +
                                            "   - LOCATION field should contain the physical address\n" +
                                            "3. Additional URLs and context go in the description",
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: imageUrl,
                                        },
                                    },
                                ],
                            },
                        ],
                        functions: [
                            {
                                name: "extract_events",
                                description:
                                    "Extract event information from text or image",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        events: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                properties: {
                                                    title: {
                                                        type: "string",
                                                        description:
                                                            "The title of the event",
                                                    },
                                                    description: {
                                                        type: "string",
                                                        description:
                                                            "Additional context and non-primary URLs",
                                                    },
                                                    start_time: {
                                                        type: "string",
                                                        format: "date-time",
                                                        description:
                                                            "Start time in ISO 8601 format",
                                                    },
                                                    end_time: {
                                                        type: "string",
                                                        format: "date-time",
                                                        description:
                                                            "End time in ISO 8601 format",
                                                    },
                                                    location: {
                                                        type: "string",
                                                        description:
                                                            "For online meetings: full video conferencing URL. For in-person: physical address",
                                                    },
                                                    timezone: {
                                                        type: "string",
                                                        description:
                                                            "Timezone of the event",
                                                    },
                                                },
                                                required: [
                                                    "title",
                                                    "start_time",
                                                    "end_time",
                                                    "location",
                                                ],
                                            },
                                        },
                                    },
                                    required: ["events"],
                                },
                            },
                        ],
                        function_call: {name: "extract_events"},
                        max_tokens: 1000,
                    }),
                }
            );

            const data = await response.json();
            console.log("OpenAI API Response:", data);

            if (!response.ok) {
                throw new Error(
                    `API Error: ${data.error?.message || "Unknown error"}`
                );
            }

            if (!data.choices?.[0]?.message?.function_call) {
                throw new Error("Invalid response structure from OpenAI API");
            }

            try {
                const functionCall = data.choices[0].message.function_call;
                const eventInfo = JSON.parse(functionCall.arguments);
                console.log("Parsed event info:", eventInfo);

                // Validate and format each event
                const formattedEvents = eventInfo.events.map((event) => ({
                    ...event,
                    description: event.description || "",
                    start_time: this.ensureValidDate(event.start_time),
                    end_time: this.ensureValidDate(event.end_time),
                    timezone: event.timezone || "UTC",
                }));

                return formattedEvents;
            } catch (parseError) {
                console.error(
                    "Raw API response content:",
                    data.choices[0].message.function_call
                );
                throw new Error(
                    `Failed to parse event information: ${parseError.message}`
                );
            }
        } catch (error) {
            console.error("Full error:", error);
            throw error;
        }
    }

    setLoading(isLoading) {
        const analyzeBtn = document.getElementById("analyzeBtn");
        const loader = analyzeBtn.querySelector(".loader");

        if (isLoading) {
            analyzeBtn.disabled = true;
            analyzeBtn.classList.add("loading");
            loader.classList.remove("hidden");
        } else {
            analyzeBtn.disabled = false;
            analyzeBtn.classList.remove("loading");
            loader.classList.add("hidden");
        }
    }

    async checkPendingAnalysis() {
        const data = await chrome.storage.local.get("pendingAnalysis");
        if (data.pendingAnalysis) {
            if (data.pendingAnalysis.type === "text") {
                this.textInput.value = data.pendingAnalysis.content;
            } else {
                this.imageInput.value = data.pendingAnalysis.content;
            }
            // Clear the stored data
            await chrome.storage.local.remove("pendingAnalysis");
            // Trigger analysis
            this.analyzeContent();
        }
    }

    async saveState() {
        const state = {
            textInput: this.textInput.value,
            imageInput: this.imageInput.value,
            currentEventInfo: this.currentEventInfo,
            resultHidden: this.result.classList.contains("hidden"),
        };
        await chrome.storage.local.set({calendarState: state});
    }

    async loadSavedState() {
        console.log("Loading saved state");
        try {
            const { calendarState } = await chrome.storage.local.get('calendarState');
            console.log("Loaded calendar state:", calendarState);
            
            if (calendarState) {
                this.textInput.value = calendarState.textInput || '';
                this.imageInput.value = calendarState.imageInput || '';
                if (calendarState.currentEventInfo) {
                    this.currentEventInfo = calendarState.currentEventInfo;
                    this.displayEventInfo(this.currentEventInfo);
                    if (!calendarState.resultHidden) {
                        this.result.classList.remove('hidden');
                    }
                }
            }

            const { pendingAnalysis } = await chrome.storage.local.get('pendingAnalysis');
            console.log("Pending analysis:", pendingAnalysis);
            
            if (pendingAnalysis) {
                console.log("Processing pending analysis");
                if (pendingAnalysis.type === 'text') {
                    this.textInput.value = pendingAnalysis.content;
                } else {
                    this.imageInput.value = pendingAnalysis.content;
                }
                await chrome.storage.local.remove('pendingAnalysis');
                console.log("Triggering analysis");
                await this.analyzeContent();
            }
        } catch (error) {
            console.error("Error loading saved state:", error);
        }
    }
}

// Initialize the assistant
document.addEventListener("DOMContentLoaded", () => {
    new CalendarAssistant();
});
