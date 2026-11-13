import { activeSpace, activeTab } from "../shared/tree";
import { corral } from "./bridge";
import { useUi } from "./store";
import { Palette } from "./components/Palette";
import { PromptDialog } from "./components/PromptDialog";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { TabView } from "./components/PaneTree";

export function App() {
  const ui = useUi();
  const state = ui.core;

  if (!state) {
    return (
      <div className="connecting">
        <div className="connecting-title">Corral</div>
        <div className="connecting-text">{ui.error ?? "Starting the core…"}</div>
      </div>
    );
  }

  const space = activeSpace(state);
  const tab = activeTab(space);

  return (
    <div className={`app platform-${corral.platform}`}>
      {ui.sidebar && <Sidebar state={state} />}
      <main className="main">
        {space && <TabBar state={state} space={space} inset={!ui.sidebar && corral.platform === "darwin"} />}
        <div className="stage">{tab && <TabView key={tab.id} tab={tab} />}</div>
      </main>
      {ui.palette && <Palette state={state} />}
      {ui.prompt && <PromptDialog prompt={ui.prompt} />}
      {ui.toast && <div className="toast">{ui.toast}</div>}
    </div>
  );
}
