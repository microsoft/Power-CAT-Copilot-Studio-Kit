import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseCSZip, zipBotToMetadata } from './parser/csZipParser.js';
import { StageAService } from './analysis/StageAService.js';
const { values } = parseArgs({
    options: {
        zip: { type: 'string' },
        output: { type: 'string', default: 'stdout' },
    },
});
if (!values.zip) {
    console.error('Usage: node dist/index.js --zip <path-to-solution.zip>');
    process.exit(1);
}
const zipBuffer = readFileSync(values.zip);
const { bots, componentsBySchemaName } = await parseCSZip(zipBuffer);
const stageAService = new StageAService();
const results = [];
for (const bot of bots.filter((candidate) => candidate.generativeActionsEnabled)) {
    const components = componentsBySchemaName[bot.schemaName] || [];
    const metadata = zipBotToMetadata(bot);
    const result = await stageAService.executeStageAFromData({ botId: metadata.botId, name: metadata.name, description: bot.description }, components);
    results.push(result);
}
const output = JSON.stringify(results.length === 1 ? results[0] : results, null, 2);
if (values.output && values.output !== 'stdout') {
    writeFileSync(values.output, output);
    console.error(`Stage A output written to ${values.output}`);
}
else {
    console.log(output);
}
