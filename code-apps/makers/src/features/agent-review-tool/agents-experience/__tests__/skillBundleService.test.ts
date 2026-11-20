import { describe, expect, it, vi } from "vitest";
import { SkillBundleService, type SkillBundleDataPort } from "../services/skill/SkillBundleService";

const parentId = "11111111-1111-1111-1111-111111111111";
const botId = "22222222-2222-2222-2222-222222222222";

describe("SkillBundleService", () => {
  it("keeps the highest published version for each componentidunique", async () => {
    const port: SkillBundleDataPort = {
      listChildren: vi.fn(async () => [
        {
          botcomponentid: "old",
          componentidunique: "same",
          parentbotid: botId,
          parentbotcomponentid: parentId,
          name: "./scripts/a.py",
          schemaname: "agent.file.a",
          componenttype: 14,
          componentstate: 0,
          statecode: 0,
          statuscode: 1,
          versionnumber: 10,
          modifiedon: "2026-07-13T09:00:00Z",
          filedata: "file-old",
          filedata_name: "scripts%2Fa.py",
        },
        {
          botcomponentid: "new",
          componentidunique: "same",
          parentbotid: botId,
          parentbotcomponentid: parentId,
          name: "./scripts/a.py",
          schemaname: "agent.file.a",
          componenttype: 14,
          componentstate: 0,
          statecode: 0,
          statuscode: 1,
          versionnumber: 11,
          modifiedon: "2026-07-13T10:00:00Z",
          filedata: "file-new",
          filedata_name: "scripts%2Fa.py",
        },
      ]),
      downloadCurrent: vi.fn(),
      downloadFromOrganization: vi.fn(),
    };

    const result = await new SkillBundleService(port).listPublishedChildren(parentId, botId);
    expect(result.rows.map((row) => row.botcomponentid)).toEqual(["new"]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "duplicate-component-layer" }));
  });

  it("uses the organization-aware download path for cross-environment review", async () => {
    const port: SkillBundleDataPort = {
      listChildren: vi.fn(),
      downloadCurrent: vi.fn(),
      downloadFromOrganization: vi.fn(async () => new Uint8Array([65, 66, 67])),
    };
    const service = new SkillBundleService(port);
    const bytes = await service.downloadResource(
      {
        botcomponentid: "file",
        componentidunique: "unique",
        parentbotid: botId,
        parentbotcomponentid: parentId,
        name: "./SKILL.md",
        schemaname: "agent.file.skill",
        componenttype: 14,
        componentstate: 0,
        statecode: 0,
        statuscode: 1,
        versionnumber: 1,
        modifiedon: "2026-07-13T10:00:00Z",
        filedata: "file-id",
        filedata_name: "SKILL.md",
      },
      "https://example.crm.dynamics.com",
    );
    expect(bytes).toEqual(new Uint8Array([65, 66, 67]));
    expect(port.downloadCurrent).not.toHaveBeenCalled();
  });

  it("downloads no more than two resources concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const port: SkillBundleDataPort = {
      listChildren: vi.fn(),
      downloadCurrent: vi.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return new Uint8Array([65]);
      }),
      downloadFromOrganization: vi.fn(),
    };
    const rows = Array.from({ length: 6 }, (_, index) => ({
      botcomponentid: `file-${index}`,
      componentidunique: `unique-${index}`,
      parentbotid: botId,
      parentbotcomponentid: parentId,
      name: `references/${index}.md`,
      schemaname: `agent.file.${index}`,
      componenttype: 14,
      componentstate: 0,
      statecode: 0,
      statuscode: 1,
      versionnumber: 1,
      modifiedon: "2026-07-13T10:00:00Z",
      filedata: `file-${index}`,
      filedata_name: `references/${index}.md`,
    }));
    const result = await new SkillBundleService(port).downloadPublishedResources(rows);
    expect(result).toHaveLength(6);
    expect(maxActive).toBe(2);
  });
});
