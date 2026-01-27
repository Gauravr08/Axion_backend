import { z, ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

type Handler = (input:any)=>Promise<any>;
type Tool = { name:string; description:string; input: ZodType<any>; output: any; handler: Handler; };
const tools = new Map<string, Tool>();

export function register(tool: Tool){ tools.set(tool.name, tool); }

export function list() { 
  return [...tools.values()].map(t => {
    // Convert Zod schema to JSON Schema for MCP
    const jsonSchema:any = zodToJsonSchema(t.input as any, { target: 'openApi3' });
    
    // MCP expects a clean JSON Schema object without $schema wrapper
    // Extract the actual schema object
    const cleanSchema = {
      type: 'object',
      properties: jsonSchema.properties || {},
      required: jsonSchema.required || [],
      additionalProperties: jsonSchema.additionalProperties !== undefined 
        ? jsonSchema.additionalProperties 
        : false
    };
    
    return {
      name: t.name, 
      description: t.description,
      inputSchema: cleanSchema
    };
  }); 
}

export async function call(name: string, params: any) {
  const tool = get(name);
  return await tool.handler(params);
}

export function get(name:string){ 
  const t = tools.get(name); 
  if(!t) throw new Error(`Tool not found: ${name}`); 
  return t; 
}

export { z };
