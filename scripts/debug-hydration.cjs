const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8080/provider", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Try to trigger the click via a more direct method
  await page.evaluate(() => {
    const btn = document.querySelector('button[role="combobox"]');
    if (btn) {
      // Simulate a full user interaction sequence
      const down = new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerType: "mouse",
      });
      btn.dispatchEvent(down);

      const up = new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerType: "mouse",
      });
      btn.dispatchEvent(up);

      const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
      btn.dispatchEvent(click);
    }
  });

  await page.waitForTimeout(1000);

  const afterClick = await page.evaluate(() => {
    return {
      expanded: document.querySelector('button[role="combobox"]')?.getAttribute("aria-expanded"),
      listbox: document.querySelectorAll('[role="listbox"]').length,
    };
  });
  console.log("After simulated click:", afterClick);

  // Check if the issue is that React hasn't hydrated yet
  // Let's wait longer and try again
  await page.waitForTimeout(5000);

  await page.evaluate(() => {
    const btn = document.querySelector('button[role="combobox"]');
    if (btn) {
      const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
      btn.dispatchEvent(click);
    }
  });

  await page.waitForTimeout(1000);

  const afterLongWait = await page.evaluate(() => {
    return {
      expanded: document.querySelector('button[role="combobox"]')?.getAttribute("aria-expanded"),
      listbox: document.querySelectorAll('[role="listbox"]').length,
    };
  });
  console.log("After 8s wait + click:", afterLongWait);

  // Check if there's a React hydration issue by looking at the root element
  const hydrationCheck = await page.evaluate(() => {
    const root = document.getElementById("root");
    return {
      hasRoot: !!root,
      rootChildren: root ? root.children.length : 0,
      rootHTML: root ? root.innerHTML.substring(0, 200) : "no root",
    };
  });
  console.log("Hydration check:", hydrationCheck);

  await browser.close();
})();
