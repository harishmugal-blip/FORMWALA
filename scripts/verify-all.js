// Final verification: workflows + sharing
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite", { readonly: true });

const wfs = db.prepare("SELECT w.id, w.name, w.active, sw.projectId, sw.role FROM workflow_entity w LEFT JOIN shared_workflow sw ON sw.workflowId = w.id WHERE w.name LIKE 'CSC%'").all();
console.log("CSC WORKFLOWS:", JSON.stringify(wfs, null, 1));

const dt = db.prepare("SELECT d.name, COUNT(c.id) as cols FROM data_table d LEFT JOIN data_table_column c ON c.dataTableId = d.id GROUP BY d.id").all();
console.log("DATA TABLES:", JSON.stringify(dt));

const cr = db.prepare("SELECT name, type FROM credentials_entity").all();
console.log("CREDENTIALS:", JSON.stringify(cr));
db.close();
