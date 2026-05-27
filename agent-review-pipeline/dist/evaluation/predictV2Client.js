/**
 * PredictV2 Client — calls AI Builder custom prompts via Dataverse unbound action.
 *
 * Uses the same SPN OAuth token already acquired for artifact download.
 */
import { AI_MODEL_IDS } from './constants.js';
/**
 * Call AI Builder PredictV2 unbound action on Dataverse.
 */
async function callPredictV2(dataverseHost, accessToken, modelId, requestv2) {
    const url = `https://${dataverseHost}/api/data/v9.2/msdyn_aimodels(${modelId})/Microsoft.Dynamics.CRM.Predict`;
    const body = {
        version: '2.0',
        source: JSON.stringify({
            consumptionSource: 'Api',
            partnerSource: 'PVA',
            consumptionSourceVersion: 'GptApiClient',
        }),
        requestv2: {
            '@odata.type': '#Microsoft.Dynamics.CRM.expando',
            ...requestv2,
            $customConfig: {
                '@odata.type': '#Microsoft.Dynamics.CRM.expando',
                settings: {
                    '@odata.type': '#Microsoft.Dynamics.CRM.expando',
                    runtime: null,
                },
            },
        },
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PredictV2 failed (${response.status}): ${errorText}`);
    }
    const result = (await response.json());
    const textOutput = result.responsev2?.predictionOutput?.text;
    if (!textOutput) {
        throw new Error('PredictV2 returned no text output');
    }
    return textOutput;
}
/**
 * Invoke Stage B: Pattern Evaluation
 *
 * @param dataverseHost - Dataverse host (e.g., org.crm.dynamics.com)
 * @param accessToken - OAuth Bearer token
 * @param botComponentsJson - Stage A output stringified (topicComponents)
 */
export async function invokeStageB(dataverseHost, accessToken, botComponentsJson) {
    const textOutput = await callPredictV2(dataverseHost, accessToken, AI_MODEL_IDS.STAGE_B_PATTERN_EVAL, { botcomponents: botComponentsJson });
    return JSON.parse(textOutput);
}
/**
 * Invoke Stage C: Instruction Compliance
 *
 * @param dataverseHost - Dataverse host (e.g., org.crm.dynamics.com)
 * @param accessToken - OAuth Bearer token
 * @param agentInstructions - Raw agent instructions text
 */
export async function invokeStageC(dataverseHost, accessToken, agentInstructions) {
    const textOutput = await callPredictV2(dataverseHost, accessToken, AI_MODEL_IDS.STAGE_C_COMPLIANCE, { Instruction_20Input: agentInstructions });
    return JSON.parse(textOutput);
}
