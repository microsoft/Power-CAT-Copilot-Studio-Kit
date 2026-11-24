import { useEffect, useRef, useState } from "react";
import { FluentProvider, Tab, TabList, Title2, type TabValue } from "@fluentui/react-components";
import { agentDebuggerLightTheme } from "../theme/agentDebuggerTheme";
import type { OfflineConversationSnapshot } from "../contracts/offline-viewer";
import { ConversationActivitiesTab } from "../components/tabs/ConversationActivitiesTab";
import { installOfflinePrinting } from "./print";
import { GeneralPanel } from "./GeneralPanel";
import "../styles/design/index.css";
import "../prism-overrides.css";

/** Offline host only: presentation behavior stays in the same components used by the live debugger. */
export function OfflineApp({ snapshot }: { snapshot: OfflineConversationSnapshot }) {
  const [selectedId, setSelectedId] = useState(snapshot.exchanges[0]?.messageId);
  const selected = snapshot.exchanges.find(exchange => exchange.messageId === selectedId);
  const [selectedTab, setSelectedTab] = useState<TabValue>("general");
  const conversationRef = useRef<HTMLDivElement>(null);
  useEffect(() => installOfflinePrinting(document, window, {
    get: () => false,
    set: () => { document.documentElement.dataset.theme = "light"; },
  }), []);
  const selectMessage = (id: string) => {
    setSelectedId(id);
    const row = Array.from(conversationRef.current?.querySelectorAll<HTMLElement>("[data-message-id]") ?? [])
      .find(element => element.dataset.messageId === id);
    if (row && conversationRef.current) {
      conversationRef.current.scrollTo({ top: row.offsetTop - conversationRef.current.offsetTop, behavior: "auto" });
    }
  };
  return (
    <FluentProvider theme={agentDebuggerLightTheme}>
      <div className="w-shell"><main className="w-app offline-app">
        <header className="offline-header">
          <Title2 as="h1">Agent Debugger</Title2>
          {snapshot.identity ? <p>{snapshot.identity.agentName} · {snapshot.identity.conversationId}</p> : null}
        </header>
        <TabList aria-label="Analysis sections" selectedValue={selectedTab}
          onTabSelect={(_, data) => setSelectedTab(data.value)}>
          <Tab id="general-tab" aria-controls="general-panel" value="general">General</Tab>
          <Tab id="conversation-tab" aria-controls="conversation-panel" value="conversation">Conversation &amp; activities</Tab>
        </TabList>
        <section id="general-panel" role="tabpanel" aria-labelledby="general-tab" hidden={selectedTab !== "general"}>
          <GeneralPanel sections={snapshot.generalSections} />
        </section>
        <section id="conversation-panel" className="viewer-interactive" role="tabpanel"
          aria-labelledby="conversation-tab" hidden={selectedTab !== "conversation"}>
          <ConversationActivitiesTab
            ref={conversationRef}
            transcriptData={snapshot.transcriptData}
            selectedTurn={selected?.turn ?? null}
            selectedUserMessageId={selectedId}
            messageLabels={snapshot.messageLabels}
            selectableMessageIds={snapshot.exchanges.filter(exchange => exchange.turn.role === "assistant").map(exchange => exchange.messageId)}
            turnDurationByMessageId={snapshot.turnDurationByMessageId}
            onUserMessageClick={selectMessage}
            componentNameBySchemaName={snapshot.componentNames}
            connectedAgents={selected?.connectedAgents}
            active={selectedTab === "conversation"}
            snapshotMode
            offlineMode
          />
        </section>
      </main></div>
    </FluentProvider>
  );
}
