/**
 * Quick action buttons row for Model-Driven App pages and internal navigation.
 */

import { Button, makeStyles, tokens } from "@fluentui/react-components";
import {
  Add20Regular,
  PlayCircle20Regular,
  BotSparkle20Regular,
  TasksApp20Regular,
  Beaker20Regular,
  Gauge20Regular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { navigateToMda } from "../../../shared/utils/mda-navigation";
import { mdaPages } from "../services/mda-pages";

const useStyles = makeStyles({
  row: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
});

export function QuickActions() {
  const styles = useStyles();
  const navigate = useNavigate();

  return (
    <div className={styles.row} role="group" aria-label="Advanced testing quick actions">
      <Button
        appearance="primary"
        icon={<Add20Regular />}
        onClick={() => navigateToMda(mdaPages.newTestSet)}
      >
        New test set
      </Button>
      <Button
        appearance="primary"
        icon={<PlayCircle20Regular />}
        onClick={() => navigateToMda(mdaPages.newTestRun)}
      >
        New test run
      </Button>
      <Button icon={<BotSparkle20Regular />} onClick={() => navigateToMda(mdaPages.agentConfigList)}>
        Manage agents
      </Button>
      <Button icon={<TasksApp20Regular />} onClick={() => navigateToMda(mdaPages.rubricList)}>
        Manage rubrics
      </Button>
      <Button icon={<Beaker20Regular />} onClick={() => navigateToMda(mdaPages.testCaseList)}>
        Manage test cases
      </Button>
      <Button icon={<Gauge20Regular />} onClick={() => navigate("/advanced-testing/model-assessment")}>
        Model assessment
      </Button>
    </div>
  );
}
