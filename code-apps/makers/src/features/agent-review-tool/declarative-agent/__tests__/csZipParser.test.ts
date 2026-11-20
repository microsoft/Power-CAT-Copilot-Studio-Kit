import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { BotComponent } from '../../contracts/ServiceContracts';
import { inputDescription, makeTopic, syntheticBot } from '../../services/__tests__/stageAFixtures';
import { parseCSZip } from '../utils/csZipParser';

vi.mock('../../services/BotService', () => ({ botService: {} }));

import { StageAService } from '../../services/StageAService';

const schemaName = 'contoso_copilotagent';
const botId = '11111111-1111-1111-1111-111111111111';
const botComponentId = '22222222-2222-2222-2222-222222222222';
const skillId = '33333333-3333-3333-3333-333333333333';
const skillUniqueId = '44444444-4444-4444-4444-444444444444';
const knowledgeFileId = '77777777-7777-7777-7777-777777777777';

async function makeSolution(configuration: object, topic?: BotComponent, botXmlExtra = ''): Promise<File> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types />');
  zip.file(
    `bots/${schemaName}/bot.xml`,
    `<bot botid="{${botId}}">
      <name>Copilot ZIP Agent</name>
      <componentidunique>{${botComponentId}}</componentidunique>${botXmlExtra}
    </bot>`,
  );
  zip.file(`bots/${schemaName}/configuration.json`, JSON.stringify(configuration));

  if (topic) {
    const topicFolder = `${schemaName}.topic.WorkshopLookup`;
    zip.file(
      `botcomponents/${topicFolder}/botcomponent.xml`,
      `<botcomponent>
        <componenttype>9</componenttype>
        <name>${topic.name}</name>
        <statecode>0</statecode>
      </botcomponent>`,
    );
    zip.file(`botcomponents/${topicFolder}/data`, topic.content);
  }

  const skillFolder = `${schemaName}.skill.packaged`;
  zip.file(
    `botcomponents/${skillFolder}/botcomponent.xml`,
    `<botcomponent botcomponentid="{${skillId}}">
      <componentidunique>{${skillUniqueId}}</componentidunique>
      <componenttype>9</componenttype>
      <name>Packaged skill</name>
      <statecode>0</statecode>
    </botcomponent>`,
  );
  zip.file(
    `botcomponents/${skillFolder}/data`,
    'kind: InlineAgentSkill\ncontent: "<!-- bic:bundle=skill.zip -->"',
  );

  const resourceFolder = `${schemaName}.file.skillmd`;
  zip.file(
    `botcomponents/${resourceFolder}/botcomponent.xml`,
    `<botcomponent botcomponentid="{55555555-5555-5555-5555-555555555555}">
      <componentidunique>{66666666-6666-6666-6666-666666666666}</componentidunique>
      <parentbotcomponentid>{${skillId}}</parentbotcomponentid>
      <componenttype>14</componenttype>
      <name>SKILL.md</name>
      <statecode>0</statecode>
      <statuscode>1</statuscode>
    </botcomponent>`,
  );
  zip.file(
    `botcomponents/${resourceFolder}/filedata/SKILL.md`,
    '---\nname: packaged\ndescription: Test skill\n---\n# Instructions',
  );

  const knowledgeFolder = `${schemaName}.file.simplejavacode`;
  zip.file(
    `botcomponents/${knowledgeFolder}/botcomponent.xml`,
    `<botcomponent botcomponentid="{${knowledgeFileId}}">
      <componentidunique>{88888888-8888-8888-8888-888888888888}</componentidunique>
      <componenttype>14</componenttype>
      <name>Simple_Java_Code.docx</name>
      <statecode>0</statecode>
      <statuscode>1</statuscode>
    </botcomponent>`,
  );
  zip.file(
    `botcomponents/${knowledgeFolder}/filedata/Simple_Java_Code.docx`,
    'Example document content',
  );

  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return bytes as unknown as File;
}

describe('parseCSZip Microsoft Copilot harness routing data', () => {
  it('recognizes agentSettings-only agents and retains IDs, components, and resources', async () => {
    const parsed = await parseCSZip(await makeSolution({
      agentSettings: { instructions: 'Use the packaged skill.' },
    }));

    expect(parsed.bots).toHaveLength(1);
    expect(parsed.bots[0]).toMatchObject({
      schemaName,
      botId,
      componentIdUnique: botComponentId,
      harness: 'copilot',
      generativeActionsEnabled: true,
    });
    expect(parsed.componentsBySchemaName[schemaName]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          botcomponentid: skillId,
          componentidunique: skillUniqueId,
          componenttype: '9',
        }),
        expect.objectContaining({
          botcomponentid: knowledgeFileId,
          componenttype: '14',
          filedata_name: 'Simple_Java_Code.docx',
          parentbotcomponentid: undefined,
        }),
      ]),
    );
    expect(parsed.resourcesBySchemaName[schemaName][0]).toMatchObject({
      row: {
        parentbotcomponentid: skillId,
        name: 'SKILL.md',
        componenttype: 14,
      },
    });
  });

  it('keeps standard GenerativeActionsEnabled solution agents on the standard path', async () => {
    const parsed = await parseCSZip(await makeSolution({
      settings: { GenerativeActionsEnabled: true },
    }));

    expect(parsed.bots[0]).toMatchObject({
      harness: 'standard',
      generativeActionsEnabled: true,
    });
  });

  it('retains bound input descriptions for the standard Stage A ZIP entry path', async () => {
    const parsed = await parseCSZip(await makeSolution({
      settings: { GenerativeActionsEnabled: true },
    }, makeTopic()));
    const components = parsed.componentsBySchemaName[schemaName];
    const result = await new StageAService().executeStageAFromData(syntheticBot, components);

    expect(parsed.bots[0].harness).toBe('standard');
    expect(result.topicComponents.find(t => t.TopicName === 'Workshop Lookup')?.InputVariables)
      .toEqual([
        { VariableName: 'minimumSeats', VariableDescription: inputDescription },
        { VariableName: 'workshopCode', VariableDescription: undefined },
      ]);
    expect(result.localPatterns.find(p => p.patternName === 'Missing Input Variable Description'))
      .toMatchObject({
        status: false,
        description: '1 input variable(s) are missing a description across 1 topic(s)',
        topics: ['Workshop Lookup'],
      });
  });
});

describe('parseCSZip agent authentication mode', () => {
  const configuration = { agentSettings: { instructions: 'Use the packaged skill.' } };

  it('reads the authentication mode from bot.xml', async () => {
    const parsed = await parseCSZip(await makeSolution(
      configuration, undefined, '<authenticationmode>1</authenticationmode>',
    ));
    expect(parsed.bots[0].authenticationMode).toBe(1);
  });

  it('leaves the mode undefined when bot.xml has no value', async () => {
    const parsed = await parseCSZip(await makeSolution(configuration));
    expect(parsed.bots[0].authenticationMode).toBeUndefined();
  });

  it('ignores a value that is not a whole number', async () => {
    const parsed = await parseCSZip(await makeSolution(
      configuration, undefined, '<authenticationmode>abc</authenticationmode>',
    ));
    expect(parsed.bots[0].authenticationMode).toBeUndefined();
  });
});

describe('parseCSZip agent harness kind', () => {
  const knownCopilotConfiguration = {
    agentSettings: { $kind: 'AgentSettings', instructions: 'Use the packaged skill.' },
    recognizer: { $kind: 'CLICopilotRecognizer' },
  };

  it('reads the template from bot.xml and keeps a known Microsoft Copilot agent', async () => {
    const parsed = await parseCSZip(await makeSolution(
      knownCopilotConfiguration, undefined, '<template>cliagent-1.0.0</template>',
    ));
    expect(parsed.bots[0]).toMatchObject({
      harness: 'copilot',
      template: 'cliagent-1.0.0',
      generativeActionsEnabled: true,
    });
  });

  it('marks unknown agent settings as unsupported and keeps the agent selectable', async () => {
    const parsed = await parseCSZip(await makeSolution({ agentSettings: { $kind: 'FutureAgentSettings' } }));
    expect(parsed.bots[0]).toMatchObject({ harness: 'unsupported', generativeActionsEnabled: true });
  });

  it('marks a Microsoft Copilot template without agent settings as unsupported', async () => {
    const parsed = await parseCSZip(await makeSolution(
      { settings: { GenerativeActionsEnabled: false } }, undefined, '<template>cliagent-2.0.0</template>',
    ));
    expect(parsed.bots[0]).toMatchObject({
      harness: 'unsupported',
      template: 'cliagent-2.0.0',
      generativeActionsEnabled: true,
    });
  });

  it('keeps a standard agent standard and reads its template', async () => {
    const parsed = await parseCSZip(await makeSolution(
      { settings: { GenerativeActionsEnabled: true } }, undefined, '<template>default-2.1.0</template>',
    ));
    expect(parsed.bots[0]).toMatchObject({
      harness: 'standard',
      template: 'default-2.1.0',
      generativeActionsEnabled: true,
    });
  });

  it('leaves the template undefined when bot.xml has no template', async () => {
    const parsed = await parseCSZip(await makeSolution({ settings: { GenerativeActionsEnabled: true } }));
    expect(parsed.bots[0].template).toBeUndefined();
    expect(parsed.bots[0].harness).toBe('standard');
  });
});
