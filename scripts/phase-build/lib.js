// Shared helpers for CSC workflow builders
import { writeFileSync } from "node:fs";
export const OR_CRED = "5356ff4e-f739-4f0a-80dd-48fc3b8018b2"; // OpenRouter CSC credential id

export const WF = {
  1: "3c5c0004-0000-4000-8000-000000000001",
  2: "3c5c0003-0000-4000-8000-000000000002",
  3: "3c5c0001-0000-4000-8000-000000000003",
  4: "3c5c0002-0000-4000-8000-000000000004"
};
for (let i = 5; i <= 25; i++) {
  const nn = String(i).padStart(2, "0");
  WF[i] = `3c5c${nn}${nn}-0000-4000-8000-0000000000${nn}`;
}

export const conn = (node, type = "main", index = 0) => ({ node, type, index });
export const link = (from, to, type = "main") => ({ [from]: { [type]: [[conn(to, type)]] } });
export function mergeConn(obj, add) {
  for (const [k, v] of Object.entries(add)) {
    if (!obj[k]) obj[k] = v;
    else for (const t of Object.keys(v)) obj[k][t] = [...(obj[k][t] || []), ...v[t]];
  }
  return obj;
}

export function code(name, jsCode, opts = {}) {
  return { parameters: { mode: "runOnceForAllItems", jsCode }, name, type: "n8n-nodes-base.code", typeVersion: 2, position: [0, 0], ...opts };
}
export function dt(name, params, opts = {}) {
  return { parameters: { resource: "row", ...params }, name, type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: [0, 0], ...opts };
}
export function dtGet(name, table, key, valueExpr, opts = {}) {
  return dt(name, {
    operation: "get",
    dataTableId: { __rl: true, mode: "name", value: table },
    matchType: "allConditions",
    filters: { conditions: [{ keyName: key, condition: "eq", keyValue: valueExpr }] },
    returnAll: !!opts.returnAll,
    ...(opts.returnAll ? {} : { limit: opts.limit || 1 })
  }, opts);
}
export function dtInsert(name, table, cols, opts = {}) {
  return dt(name, {
    operation: "insert",
    dataTableId: { __rl: true, mode: "name", value: table },
    columns: { mappingMode: "defineBelow", value: cols, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: false }
  }, opts);
}
export function dtUpdate(name, table, key, keyValueExpr, cols, opts = {}) {
  return dt(name, {
    operation: "update",
    dataTableId: { __rl: true, mode: "name", value: table },
    matchType: "allConditions",
    filters: { conditions: [{ keyName: key, condition: "eq", keyValue: keyValueExpr }] },
    columns: { mappingMode: "defineBelow", value: cols, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: false }
  }, opts);
}
export function dtUpsert(name, table, matchKey, matchValueExpr, cols, opts = {}) {
  return dt(name, {
    operation: "upsert",
    dataTableId: { __rl: true, mode: "name", value: table },
    matchType: "allConditions",
    filters: { conditions: [{ keyName: matchKey, condition: "eq", keyValue: matchValueExpr }] },
    columns: { mappingMode: "defineBelow", value: cols, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: false }
  }, opts);
}
export function dtDelete(name, table, key, valueExpr, opts = {}) {
  return dt(name, {
    operation: "delete",
    dataTableId: { __rl: true, mode: "name", value: table },
    matchType: "allConditions",
    filters: { conditions: [{ keyName: key, condition: "eq", keyValue: valueExpr }] }
  }, opts);
}
// IF v2.2 - conditions: array of {id, leftValue, rightValue, operator:{type, operation, singleValue?}}
export function ifNode(name, conditions, combinator = "and", opts = {}) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: conditions.map((c, i) => ({ id: "c" + i + "-" + name.replace(/\W/g, ""), ...c })),
        combinator
      },
      options: {}
    },
    name, type: "n8n-nodes-base.if", typeVersion: 2.2, position: [0, 0], ...opts
  };
}
export const eq = (left, right) => ({ leftValue: left, rightValue: right, operator: { type: "string", operation: "equals" } });
export const notEq = (left, right) => ({ leftValue: left, rightValue: right, operator: { type: "string", operation: "notEquals" } });
export const isEmpty = (left) => ({ leftValue: left, rightValue: "", operator: { type: "string", operation: "isEmpty", singleValue: true } });
export const notEmpty = (left) => ({ leftValue: left, rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } });
export const isTrue = (left) => ({ leftValue: left, rightValue: "true", operator: { type: "boolean", operation: "true", singleValue: true } });

export function exwf(name, workflowId, opts = {}) {
  return { parameters: { source: "database", workflowId }, name, type: "n8n-nodes-base.executeWorkflow", typeVersion: 1, position: [0, 0], ...opts };
}
export function triggerSub(name = "Trigger") {
  return { parameters: {}, name, type: "n8n-nodes-base.executeWorkflowTrigger", typeVersion: 1.1, position: [0, 0] };
}
export function webhookNode(name, path, method = "POST", opts = {}) {
  return { parameters: { httpMethod: method, path, responseMode: "responseNode", options: {} }, name, type: "n8n-nodes-base.webhook", typeVersion: 2, webhookId: "whk-" + path.replace(/\W/g, "") + "-" + method.toLowerCase(), position: [0, 0], ...opts };
}
export function respond(name, params, opts = {}) {
  return { parameters: params, name, type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [0, 0], ...opts };
}
export function http(name, params, opts = {}) {
  return { parameters: params, name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [0, 0], ...opts };
}
export function scheduleNode(name, rule, opts = {}) {
  return { parameters: { rule: { interval: [rule] } }, name, type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0], ...opts };
}
export function cryptoNode(name, params, opts = {}) {
  return { parameters: params, name, type: "n8n-nodes-base.crypto", typeVersion: 1, position: [0, 0], ...opts };
}
export function buildWorkflow(id, name, nodes, connections) {
  return { id, name, nodes, connections, settings: { executionOrder: "v1" }, pinData: {} };
}
export function writeJson(filepath, obj) {
  writeFileSync(filepath, JSON.stringify(obj, null, 1));
  console.log("written:", filepath, "(" + obj.nodes.length + " nodes)");
}
