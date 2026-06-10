figma.showUI(__html__, { width: 420, height: 300, title: "Icon Finder" });

async function analyzeSelection() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: "no-selection" });
    return;
  }

  figma.ui.postMessage({ type: "loading" });

  const nodes: Array<{
    id: string;
    name: string;
    type: string;
    png: number[] | null;
    error?: string;
  }> = [];

  for (const node of selection) {
    try {
      // Export at 64px wide — enough resolution for pHash, small enough to be fast
      const bytes = await node.exportAsync({
        format: "PNG",
        constraint: { type: "WIDTH", value: 64 },
      });
      nodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
        png: Array.from(bytes),
      });
    } catch (e) {
      nodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
        png: null,
        error: String(e),
      });
    }
  }

  figma.ui.postMessage({ type: "analyze-png", nodes });
}

figma.ui.onmessage = async (msg: { type: string; height?: number }) => {
  if (msg.type === "analyze") {
    await analyzeSelection();
  } else if (msg.type === "resize" && msg.height) {
    figma.ui.resize(420, Math.min(msg.height, 700));
  }
};

analyzeSelection();
figma.on("selectionchange", analyzeSelection);
