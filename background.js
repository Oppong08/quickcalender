chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed/updated");
    chrome.contextMenus.create({
        id: "quickcal-text",
        title: "Add to Calendar (QuickCal)",
        contexts: ["selection"]
    });

    chrome.contextMenus.create({
        id: "quickcal-image",
        title: "Add to Calendar (QuickCal)",
        contexts: ["image"]
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log("Context menu clicked:", info.menuItemId);
    
    const data = {
        type: info.menuItemId === "quickcal-text" ? 'text' : 'image',
        content: info.menuItemId === "quickcal-text" ? info.selectionText : info.srcUrl
    };
    
    console.log("Storing data:", data);

    try {
        // Store the data first
        await chrome.storage.local.set({ pendingAnalysis: data });
        console.log("Data stored successfully");

        // Then open popup
        await chrome.action.openPopup();
        console.log("Popup opened");

        // Wait a moment before sending message
        setTimeout(async () => {
            try {
                await chrome.runtime.sendMessage({
                    action: "analyzeContent",
                    content: info.menuItemId === "quickcal-text" ? info.selectionText : null,
                    imageUrl: info.menuItemId === "quickcal-image" ? info.srcUrl : null
                });
                console.log("Message sent to popup");
            } catch (error) {
                console.error("Error sending message:", error);
            }
        }, 500);
    } catch (error) {
        console.error("Error in context menu handler:", error);
    }
});
