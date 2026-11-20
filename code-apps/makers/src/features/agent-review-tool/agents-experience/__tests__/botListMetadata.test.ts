import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../generated/services/BotsService", () => ({
  BotsService: { getAll: vi.fn(), get: vi.fn() },
}));
vi.mock("../../../../generated/services/BotcomponentsService", () => ({
  BotcomponentsService: { getAll: vi.fn() },
}));
vi.mock("../../../../generated/services/MicrosoftDataverseService", () => ({
  MicrosoftDataverseService: {
    ListRecordsWithOrganization: vi.fn(),
  },
}));

import { BotsService } from "../../../../generated/services/BotsService";
import { MicrosoftDataverseService } from "../../../../generated/services/MicrosoftDataverseService";
import { fetchBotsFromOrg } from "../../hooks/useAllBots";
import { BotService } from "../../services/BotService";

const copilotConfiguration = JSON.stringify({ agentSettings: {} });

describe("bot list metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves componentidunique for bots in the current environment", async () => {
    vi.mocked(BotsService.getAll).mockResolvedValue({
      success: true,
      data: [{
        botid: "bot-1",
        name: "Microsoft Copilot agent",
        statuscode: 1,
        componentidunique: "component-1",
        publishedon: "2026-03-01T10:00:00Z",
        configuration: copilotConfiguration,
      }],
    });

    const bots = await new BotService().getAllActiveBots();

    expect(bots[0]?.componentIdUnique).toBe("component-1");
    expect(bots[0]?.publishedOn?.toISOString()).toBe(
      "2026-03-01T10:00:00.000Z",
    );
    expect(vi.mocked(BotsService.getAll).mock.calls[0]?.[0]?.select).toContain(
      "componentidunique",
    );
    expect(vi.mocked(BotsService.getAll).mock.calls[0]?.[0]?.select).toContain(
      "publishedon",
    );
  });

  it("preserves componentidunique for bots in a selected environment", async () => {
    vi.mocked(
      MicrosoftDataverseService.ListRecordsWithOrganization,
    ).mockResolvedValue({
      success: true,
      data: {
        value: [{
          botid: "bot-2",
          name: "Remote copilot agent",
          statuscode: 1,
          componentidunique: "component-2",
          publishedon: "2026-03-02T11:00:00Z",
          configuration: copilotConfiguration,
        }],
      },
    });

    const bots = await fetchBotsFromOrg("https://example.crm.dynamics.com");

    expect(bots[0]?.componentIdUnique).toBe("component-2");
    expect(bots[0]?.publishedOn?.toISOString()).toBe(
      "2026-03-02T11:00:00.000Z",
    );
    expect(
      vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization)
        .mock.calls[0]?.[6],
    ).toContain("componentidunique");
    expect(
      vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization)
        .mock.calls[0]?.[6],
    ).toContain("publishedon");
  });

  it("resolves a connected agent by exact active published schema name", async () => {
    vi.mocked(BotsService.getAll).mockResolvedValue({
      success: true,
      data: [{
        botid: "d3aaaaaa-aaaa-4aaa-aaaa-000000000015",
        name: "ZAVA Store Ops Assistant",
        schemaname: "cr306_zavastoreopsassistant_lmpyHR",
        configuration: copilotConfiguration,
      }],
    });

    const result = await new BotService().getBotBySchemaName(
      "cr306_zavastoreopsassistant_lmpyHR",
    );

    expect(result).toEqual({
      botId: "d3aaaaaa-aaaa-4aaa-aaaa-000000000015",
      name: "ZAVA Store Ops Assistant",
      schemaName: "cr306_zavastoreopsassistant_lmpyHR",
      configuration: copilotConfiguration,
    });
    expect(vi.mocked(BotsService.getAll).mock.calls[0]?.[0]?.filter).toBe(
      "schemaname eq 'cr306_zavastoreopsassistant_lmpyHR' and statecode eq 0 and componentstate eq 0",
    );
  });

  it("rejects ambiguous connected-agent schema matches", async () => {
    vi.mocked(BotsService.getAll).mockResolvedValue({
      success: true,
      data: [
        {
          botid: "bot-1",
          name: "Duplicate 1",
          schemaname: "duplicate_schema",
          configuration: copilotConfiguration,
        },
        {
          botid: "bot-2",
          name: "Duplicate 2",
          schemaname: "duplicate_schema",
          configuration: copilotConfiguration,
        },
      ],
    });

    await expect(new BotService().getBotBySchemaName("duplicate_schema")).rejects.toThrow(
      "matched multiple active published bots",
    );
  });

  it("loads connected-agent botcomponent details from the selected environment", async () => {
    vi.mocked(
      MicrosoftDataverseService.ListRecordsWithOrganization,
    )
      .mockResolvedValueOnce({
        success: true,
        data: {
          value: [{
            botcomponentid: "skill-id",
            name: "store-price",
            componenttype: 15,
            content: "",
            data: "",
            componentidunique: "skill-unique",
            schemaname: "store.skill.price",
          }],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          value: [{
            data: "kind: InlineAgentSkill\ncontent: '# Store price'",
          }],
        },
      });

    const components = await new BotService().getBotComponents(
      "d3aaaaaa-aaaa-4aaa-aaaa-000000000015",
      "https://contoso.crm.dynamics.com",
      { throwOnError: true },
    );

    expect(components[0]?.data).toContain("InlineAgentSkill");
    expect(
      vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization)
        .mock.calls.map(call => call[0]),
    ).toEqual([
      "https://contoso.crm.dynamics.com",
      "https://contoso.crm.dynamics.com",
    ]);
  });

  it("preserves uploaded knowledge file metadata without requesting YAML details", async () => {
    vi.mocked(
      MicrosoftDataverseService.ListRecordsWithOrganization,
    ).mockResolvedValueOnce({
      success: true,
      data: {
        value: [{
          botcomponentid: "file-id",
          name: "Simple_Java_Code.docx",
          componenttype: 14,
          content: "",
          data: "",
          componentidunique: "file-unique",
          schemaname: "agent.file.simple-java-code",
          filedata_name: "Simple_Java_Code.docx",
        }],
      },
    });

    const components = await new BotService().getBotComponents(
      "d3aaaaaa-aaaa-4aaa-aaaa-000000000015",
      "https://contoso.crm.dynamics.com",
      { throwOnError: true },
    );

    expect(components[0]).toMatchObject({
      componenttype: "14",
      filedata_name: "Simple_Java_Code.docx",
    });
    expect(
      vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization),
    ).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization)
        .mock.calls[0]?.[6],
    ).toContain("filedata_name");
  });

  it("surfaces strict connected-agent detail failures", async () => {
    vi.mocked(
      MicrosoftDataverseService.ListRecordsWithOrganization,
    )
      .mockResolvedValueOnce({
        success: true,
        data: {
          value: [{
            botcomponentid: "skill-id",
            name: "store-price",
            componenttype: 15,
            content: "",
            data: "",
            componentidunique: "skill-unique",
            schemaname: "store.skill.price",
          }],
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: "Detail request failed",
      });

    await expect(new BotService().getBotComponents(
      "d3aaaaaa-aaaa-4aaa-aaaa-000000000015",
      "https://contoso.crm.dynamics.com",
      { throwOnError: true },
    )).rejects.toThrow("Unable to load botcomponent details for skill-id.");
  });

  it("rejects a successful strict detail response with no component row", async () => {
    vi.mocked(
      MicrosoftDataverseService.ListRecordsWithOrganization,
    )
      .mockResolvedValueOnce({
        success: true,
        data: {
          value: [{
            botcomponentid: "skill-id",
            name: "store-price",
            componenttype: 15,
            content: "",
            data: "",
            componentidunique: "skill-unique",
            schemaname: "store.skill.price",
          }],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { value: [] },
      });

    await expect(new BotService().getBotComponents(
      "d3aaaaaa-aaaa-4aaa-aaaa-000000000015",
      "https://contoso.crm.dynamics.com",
      { throwOnError: true },
    )).rejects.toThrow("Unable to load botcomponent details for skill-id.");
  });

  it("rejects a strict component that needs details but has no identity", async () => {
    vi.mocked(
      MicrosoftDataverseService.ListRecordsWithOrganization,
    ).mockResolvedValueOnce({
      success: true,
      data: {
        value: [{
          botcomponentid: "",
          name: "store-price",
          componenttype: 15,
          content: "",
          data: "",
          componentidunique: "skill-unique",
          schemaname: "store.skill.price",
        }],
      },
    });

    await expect(new BotService().getBotComponents(
      "d3aaaaaa-aaaa-4aaa-aaaa-000000000015",
      "https://contoso.crm.dynamics.com",
      { throwOnError: true },
    )).rejects.toThrow("Unable to load botcomponent details because its identity is missing.");
  });
});

describe("agent harness detection in the agent list", () => {
  const standardConfiguration = JSON.stringify({ settings: { GenerativeActionsEnabled: true } });
  const classicConfiguration = JSON.stringify({ settings: { GenerativeActionsEnabled: false } });
  const knownCopilotConfiguration = JSON.stringify({
    agentSettings: { $kind: "AgentSettings" },
    recognizer: { $kind: "CLICopilotRecognizer" },
  });
  const rows = [
    { botid: "bot-standard", name: "Standard agent", statuscode: 1, componentidunique: "c-standard", configuration: standardConfiguration, template: "default-2.1.0" },
    { botid: "bot-copilot", name: "Copilot agent", statuscode: 1, componentidunique: "c-copilot", configuration: knownCopilotConfiguration, template: "cliagent-1.0.0" },
    { botid: "bot-future", name: "Future agent", statuscode: 1, componentidunique: "c-future", configuration: classicConfiguration, template: "cliagent-2.0.0" },
    { botid: "bot-hidden", name: "Hidden agent", statuscode: 1, componentidunique: "c-hidden", configuration: classicConfiguration },
  ];
  const expected = [
    ["Standard agent", "standard"],
    ["Copilot agent", "copilot"],
    ["Future agent", "unsupported"],
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets the harness and reads the template in the current environment", async () => {
    vi.mocked(BotsService.getAll).mockResolvedValue({ success: true, data: rows });

    const bots = await new BotService().getAllActiveBots();

    expect(bots.map((bot) => [bot.name, bot.harness])).toEqual(expected);
    expect(vi.mocked(BotsService.getAll).mock.calls[0]?.[0]?.select).toContain("template");
  });

  it("sets the harness and reads the template in a selected environment", async () => {
    vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization).mockResolvedValue({
      success: true,
      data: { value: rows },
    });

    const bots = await fetchBotsFromOrg("https://example.crm.dynamics.com");

    expect(bots.map((bot) => [bot.name, bot.harness])).toEqual(expected);
    expect(vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization).mock.calls[0]?.[6]).toContain("template");
  });

  it("sets the harness on the metadata of one agent", async () => {
    vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization)
      .mockResolvedValueOnce({
        success: true,
        data: { value: [{ botid: "bot-9", name: "Future agent", statuscode: 1, configuration: standardConfiguration, template: "cliagent-2.0.0" }] },
      })
      .mockResolvedValue({ success: true, data: { value: [] } });

    const metadata = await new BotService().getBotMetadata("bot-9", "https://example.crm.dynamics.com");

    expect(metadata.harness).toBe("unsupported");
    expect(vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization).mock.calls[0]?.[6]).toContain("template");
  });

  it("reads the configuration and the template in one request in a selected environment", async () => {
    vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization).mockResolvedValueOnce({
      success: true,
      data: { value: [{ configuration: standardConfiguration, template: "cliagent-2.0.0" }] },
    });

    const source = await new BotService().getBotHarnessSource("bot-9", "https://example.crm.dynamics.com");

    expect(source).toEqual({ configuration: standardConfiguration, template: "cliagent-2.0.0" });
    expect(vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(MicrosoftDataverseService.ListRecordsWithOrganization).mock.calls[0]?.[6]).toBe("configuration,template");
  });

  it("reads the configuration and the template in one request in the current environment", async () => {
    vi.mocked(BotsService.get).mockResolvedValueOnce({
      success: true,
      data: { configuration: standardConfiguration, template: "cliagent-2.0.0" },
    });

    const source = await new BotService().getBotHarnessSource("bot-9");

    expect(source).toEqual({ configuration: standardConfiguration, template: "cliagent-2.0.0" });
    expect(vi.mocked(BotsService.get)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(BotsService.get).mock.calls[0]?.[1]?.select).toEqual(["configuration", "template"]);
  });
});
