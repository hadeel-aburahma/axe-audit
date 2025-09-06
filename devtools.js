try {
  chrome.devtools.panels.create(
    "Axe Audit",
    "icon16.png",
    "panel.html",
    (panel) => {
      console.log("Axe Audit panel created successfully.");
    }
  );
} catch (e) {
  console.error("Error creating DevTools panel:", e);
}