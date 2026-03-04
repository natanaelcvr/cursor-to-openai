const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const $root = require('../proto/message.js');

const TOOL_PREFIX = 'oc_';

function addToolPrefix(name) {
  return TOOL_PREFIX + name;
}

function stripToolPrefix(name) {
  return name.startsWith(TOOL_PREFIX) ? name.slice(TOOL_PREFIX.length) : name;
}

function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(p => p.type === 'text' || typeof p === 'string')
      .map(p => typeof p === 'string' ? p : p.text || '')
      .join('\n');
  }
  return String(content || '');
}

function parseToolCalls(content) {
  const toolCalls = [];
  let index = 0;

  const toolCallRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match;
  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const rawName = parsed.name || parsed.tool_name || '';
      toolCalls.push({
        index: index++,
        id: `call_${uuidv4().replace(/-/g, '').substring(0, 24)}`,
        type: 'function',
        function: {
          name: stripToolPrefix(rawName),
          arguments: JSON.stringify(parsed.arguments || parsed.parameters || {})
        }
      });
    } catch (e) {}
  }

  if (toolCalls.length === 0) {
    const funcCallsRegex = /<function_calls>\s*([\s\S]*?)\s*<\/function_calls>/g;
    while ((match = funcCallsRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        const calls = Array.isArray(parsed) ? parsed : [parsed];
        for (const call of calls) {
          const rawName = call.name || call.tool_name || '';
          toolCalls.push({
            index: index++,
            id: `call_${uuidv4().replace(/-/g, '').substring(0, 24)}`,
            type: 'function',
            function: {
              name: stripToolPrefix(rawName),
              arguments: JSON.stringify(call.arguments || call.parameters || {})
            }
          });
        }
      } catch (e) {}
    }
  }

  return toolCalls;
}

function stripToolCalls(content) {
  return content
    .replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/g, '')
    .replace(/<function_calls>\s*[\s\S]*?\s*<\/function_calls>/g, '')
    .trim();
}

function generateCursorBody(messages, modelName, tools) {

  const hasTools = tools && tools.length > 0;
  const chatModeEnum = 2;
  const chatModeStr = "Agent";

  let instruction = messages
    .filter(msg => msg.role === 'system')
    .map(msg => normalizeContent(msg.content))
    .join('\n')

  let toolSuffix = '';
  if (hasTools) {
    const toolsSchema = tools.map(t => {
      const fn = t.function || t;
      const params = fn.parameters || {};
      const paramNames = Object.keys((params.properties) || {});
      const prefixedName = addToolPrefix(fn.name);
      return `{"name":"${prefixedName}","params":{${paramNames.map(p => `"${p}":"${(params.properties[p] || {}).type || 'string'}"`).join(',')}}}`;
    });
    toolSuffix = `\n\n---\ntools_schema: [${toolsSchema.join(',')}]\nresponse_format: <tool_call>{"name":"...","arguments":{...}}</tool_call>`;
  }

  let lastUserIdx = -1;
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    if (nonSystemMessages[i].role === 'user') { lastUserIdx = i; break; }
  }

  const formattedMessages = nonSystemMessages
    .flatMap((msg, idx) => {
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        let content = normalizeContent(msg.content) || '';
        for (const tc of msg.tool_calls) {
          const fn = tc.function || tc;
          let args = fn.arguments;
          if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch(e) {}
          }
          const prefixedName = hasTools ? addToolPrefix(fn.name) : fn.name;
          content += `\n<tool_call>\n${JSON.stringify({name: prefixedName, arguments: args})}\n</tool_call>`;
        }
        return [{
          content: content,
          role: 2,
          messageId: uuidv4(),
        }];
      }

      if (msg.role === 'tool') {
        return [{
          content: `<tool_result call_id="${msg.tool_call_id || ''}">\n${normalizeContent(msg.content)}\n</tool_result>`,
          role: 1,
          messageId: uuidv4(),
          chatModeEnum: chatModeEnum,
        }];
      }

      let content = normalizeContent(msg.content);
      if (msg.role === 'user' && hasTools && idx === lastUserIdx) {
        content += toolSuffix;
      }

      return [{
        content: content,
        role: msg.role === 'user' ? 1 : 2,
        messageId: uuidv4(),
        ...(msg.role === 'user' ? { chatModeEnum: chatModeEnum } : {}),
      }];
    });

  const messageIds = formattedMessages.map(msg => {
    const { role, messageId, summaryId } = msg;
    return summaryId ? { role, messageId, summaryId } : { role, messageId };
  });

  const body = {
    request:{
      messages: formattedMessages,
      unknown2: 1,
      instruction: {
        instruction: instruction
      },
      unknown4: 1,
      model: {
        name: modelName,
        empty: '',
      },
      webTool: "",
      unknown13: 1,
      cursorSetting: {
        name: "cursor\\aisettings",
        unknown3: "",
        unknown6: {
          unknwon1: "",
          unknown2: ""
        },
        unknown8: 1,
        unknown9: 1
      },
      unknown19: 1,
      //unknown22: 1,
      conversationId: uuidv4(),
      metadata: {
        os: "win32",
        arch: "x64",
        version: "10.0.22631",
        path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        timestamp: new Date().toISOString(),
      },
      unknown27: 0,
      //unknown29: "",
      messageIds: messageIds,
      largeContext: 0,
      unknown38: 0,
      chatModeEnum: chatModeEnum,
      unknown47: "",
      unknown48: 0,
      unknown49: 0,
      unknown51: 0,
      unknown53: 1,
      chatMode: chatModeStr
    }
  };

  const errMsg = $root.StreamUnifiedChatWithToolsRequest.verify(body);
  if (errMsg) throw Error(errMsg);
  const instance = $root.StreamUnifiedChatWithToolsRequest.create(body);
  let buffer = $root.StreamUnifiedChatWithToolsRequest.encode(instance).finish();
  let magicNumber = 0x00
  if (formattedMessages.length >= 3){
    buffer = zlib.gzipSync(buffer)
    magicNumber = 0x01
  }

  const finalBody = Buffer.concat([
    Buffer.from([magicNumber]),
    Buffer.from(buffer.length.toString(16).padStart(8, '0'), 'hex'),
    buffer
  ])

  return finalBody
}

function chunkToUtf8String(chunk) {
  const results = []
  const thinkingResults = []
  const contentResults = []
  const errorResults = { hasError: false, errorMessage: '' }
  const buffer = Buffer.from(chunk, 'hex');
  //console.log("Chunk buffer:", buffer.toString('hex'))

  try {
    for(let i = 0; i < buffer.length; i++){
      const magicNumber = parseInt(buffer.subarray(i, i + 1).toString('hex'), 16)
      const dataLength = parseInt(buffer.subarray(i + 1, i + 5).toString('hex'), 16)
      const data = buffer.subarray(i + 5, i + 5 + dataLength)
      //console.log("Parsed buffer:", magicNumber, dataLength, data.toString('hex'))

      if (magicNumber == 0 || magicNumber == 1) {
        const gunzipData = magicNumber == 0 ? data : zlib.gunzipSync(data)
        const response = $root.StreamUnifiedChatWithToolsResponse.decode(gunzipData);
        const thinking = response?.message?.thinking?.content
        if (thinking !== undefined && thinking.length > 0){
            thinkingResults.push(thinking);
            // console.log('[DEBUG] Received thinking:', thinking);
        }
        const content = response?.message?.content
        if (content !== undefined && content.length > 0){
          contentResults.push(content)
          // console.log('[DEBUG] Received content:', content);
        }
      }
      else if (magicNumber == 2 || magicNumber == 3) { 
        // Json message
        const gunzipData = magicNumber == 2 ? data : zlib.gunzipSync(data)
        const utf8 = gunzipData.toString('utf-8')
        const message = JSON.parse(utf8)

        if (message != null && (typeof message !== 'object' || 
          (Array.isArray(message) ? message.length > 0 : Object.keys(message).length > 0))){
            //results.push(utf8)
            console.error(utf8)
            
            // Check if error message
            if (message && message.error) {
              errorResults.hasError = true;
              errorResults.errorMessage = utf8;
            }
        }
      }
      else {
        //console.log('Unknown magic number when parsing chunk response: ' + magicNumber)
      }

      i += 5 + dataLength - 1
    }
  } catch (err) {
    console.log('Error parsing chunk response:', err)
  }

  // If error exists, return error object
  if (errorResults.hasError) {
    return { error: errorResults.errorMessage };
  }

  // Return thinking and content separately
  return {
    reasoning_content: thinkingResults.join(''),
    content: contentResults.join('')
  };
}

function generateHashed64Hex(input, salt = '') {
  const hash = crypto.createHash('sha256');
  hash.update(input + salt);
  return hash.digest('hex');
}

function obfuscateBytes(byteArray) {
  let t = 165;
  for (let r = 0; r < byteArray.length; r++) {
    byteArray[r] = (byteArray[r] ^ t) + (r % 256);
    t = byteArray[r];
  }
  return byteArray;
}

function generateCursorChecksum(token) {
  const machineId = generateHashed64Hex(token, 'machineId');
  const macMachineId = generateHashed64Hex(token, 'macMachineId');

  const timestamp = Math.floor(Date.now() / 1e6);
  const byteArray = new Uint8Array([
    (timestamp >> 40) & 255,
    (timestamp >> 32) & 255,
    (timestamp >> 24) & 255,
    (timestamp >> 16) & 255,
    (timestamp >> 8) & 255,
    255 & timestamp,
  ]);

  const obfuscatedBytes = obfuscateBytes(byteArray);
  const encodedChecksum = Buffer.from(obfuscatedBytes).toString('base64');

  return `${encodedChecksum}${machineId}/${macMachineId}`;
}

module.exports = {
  generateCursorBody,
  chunkToUtf8String,
  generateHashed64Hex,
  generateCursorChecksum,
  parseToolCalls,
  stripToolCalls,
  addToolPrefix,
  stripToolPrefix
};
