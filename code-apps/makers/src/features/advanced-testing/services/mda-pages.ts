/**
 * MDA page-param builders for Copilot Agent Kit test entities.
 * Used by Advanced Testing quick actions, card clicks, and "See all" links.
 */

export const mdaPages = {
  newTestSet: "pagetype=entityrecord&etn=cat_copilottestset",
  newTestRun: "pagetype=entityrecord&etn=cat_copilottestrun",
  testSetById: (id: string) => `pagetype=entityrecord&etn=cat_copilottestset&id=${id}`,
  testSetList: "pagetype=entitylist&etn=cat_copilottestset",
  testRunById: (id: string) => `pagetype=entityrecord&etn=cat_copilottestrun&id=${id}`,
  testRunList: "pagetype=entitylist&etn=cat_copilottestrun",
  agentConfigList: "pagetype=entitylist&etn=cat_copilotconfiguration",
  rubricList: "pagetype=entitylist&etn=cat_rubric",
  testCaseList: "pagetype=entitylist&etn=cat_copilottest",
};
