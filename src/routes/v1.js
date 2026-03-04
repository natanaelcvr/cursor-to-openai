const express = require('express');
const router = express.Router();
const { fetch, ProxyAgent, Agent } = require('undici');

const $root = require('../proto/message.js');
const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const { generateCursorBody, chunkToUtf8String, generateHashed64Hex, generateCursorChecksum, parseToolCalls, stripToolCalls } = require('../utils/utils.js');
const keyManager = require('../utils/keyManager.js');
const { spawn } = require('child_process');
const path = require('path');
const admin = require('../models/admin');
const config = require('../config/config');
const crypto = require('crypto');
const logger = require('../utils/logger');

const CURSOR_CLIENT_VERSION = process.env.CURSOR_CLIENT_VERSION || "2.5.20";

// Variable to store refresh status
let refreshStatus = {
  isRunning: false,
  status: 'idle', // idle, running, completed, failed
  message: '',
  startTime: null,
  endTime: null,
  error: null
};

// Store currently processing Cookie retrieval requests
const pendingCookieRequests = new Map();

// Check if admin account exists
router.get('/admin/check', (req, res) => {
  try {
    return res.json({
      success: true,
      exists: admin.hasAdmin()
    });
  } catch (error) {
    logger.error('Failed to check admin account:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Register admin
router.post('/admin/register', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password cannot be empty'
      });
    }
    
    const token = admin.register(username, password);
    
    return res.json({
      success: true,
      message: 'Registration successful',
      token
    });
  } catch (error) {
    logger.error('Failed to register admin:', error);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Admin login
router.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password cannot be empty'
      });
    }
    
    const token = admin.login(username, password);
    
    return res.json({
      success: true,
      message: 'Login successful',
      token
    });
  } catch (error) {
    logger.error('Login failed:', error);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Verify token
router.get('/admin/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Auth token not provided'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const result = admin.verifyToken(token);
    
    return res.json(result);
  } catch (error) {
    logger.error('Failed to verify token:', error);
    return res.status(401).json({
      success: false,
      message: error.message
    });
  }
});

// Add API key management route
router.post("/api-keys", async (req, res) => {
  try {
    const { apiKey, cookieValues } = req.body;
    
    if (!apiKey || !cookieValues) {
      return res.status(400).json({
        error: 'API key and cookie values are required',
      });
    }
    
    keyManager.addOrUpdateApiKey(apiKey, cookieValues);
    
    return res.json({
      success: true,
      message: 'API key added or updated successfully',
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

// Get all API Keys
router.get("/api-keys", async (req, res) => {
  try {
    logger.info('Received get API Keys request');
    const apiKeys = keyManager.getAllApiKeys();
    logger.info('Fetched API Keys:', apiKeys);
    
    const result = {
      success: true,
      apiKeys: apiKeys.map(apiKey => ({
        key: apiKey,
        cookieCount: keyManager.getAllCookiesForApiKey(apiKey).length,
      })),
    };
    logger.info('Return result:', result);
    
    return res.json(result);
  } catch (error) {
    logger.error('Failed to get API Keys:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Delete API key
router.delete("/api-keys/:apiKey", async (req, res) => {
  try {
    const { apiKey } = req.params;
    
    keyManager.removeApiKey(apiKey);
    
    return res.json({
      success: true,
      message: 'API key removed successfully',
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

// Get Cookie values for specific API Key
router.get("/api-keys/:apiKey/cookies", async (req, res) => {
  try {
    const { apiKey } = req.params;
    logger.info(`Received get Cookie request for API Key ${apiKey}`);
    
    const cookies = keyManager.getAllCookiesForApiKey(apiKey);
    logger.info(`API Key ${apiKey} Cookie values:`, cookies);
    
    return res.json({
      success: true,
      cookies: cookies
    });
  } catch (error) {
    logger.error(`Failed to get Cookie for API Key ${req.params.apiKey}:`, error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get all invalid cookies
router.get("/invalid-cookies", async (req, res) => {
  try {
    const invalidCookies = keyManager.getInvalidCookies();
    
    return res.json({
      success: true,
      invalidCookies: Array.from(invalidCookies)
    });
  } catch (error) {
    logger.error('Failed to get invalid cookies:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Clear specific invalid cookie
router.delete("/invalid-cookies/:cookie", async (req, res) => {
  try {
    const { cookie } = req.params;
    const success = keyManager.clearInvalidCookie(cookie);
    
    return res.json({
      success: success,
      message: success ? 'Invalid cookie cleared' : 'Specified invalid cookie not found'
    });
  } catch (error) {
    logger.error('Failed to clear invalid cookie:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Clear all invalid cookies
router.delete("/invalid-cookies", async (req, res) => {
  try {
    keyManager.clearAllInvalidCookies();
    
    return res.json({
      success: true,
      message: 'All invalid cookies cleared'
    });
  } catch (error) {
    logger.error('Failed to clear all invalid cookies:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Batch add invalid cookies
router.post("/invalid-cookies", async (req, res) => {
  try {
    const { invalidCookies } = req.body;
    
    if (!Array.isArray(invalidCookies)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'invalidCookies must be an array'
      });
    }
    
    // Get current invalid cookie set
    const currentInvalidCookies = keyManager.getInvalidCookies();
    
    // Add new invalid cookies
    for (const cookie of invalidCookies) {
      if (typeof cookie === 'string' && cookie.trim()) {
        currentInvalidCookies.add(cookie.trim());
      }
    }
    
    // Save to file
    keyManager.saveInvalidCookiesToFile();
    
    return res.json({
      success: true,
      message: `Added ${invalidCookies.length} invalid cookies`
    });
  } catch (error) {
    logger.error('Failed to add invalid cookies:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.get("/models", async (req, res) => {
  try{
    let bearerToken = req.headers.authorization?.replace('Bearer ', '');
    
    // Use keyManager to get actual cookie
    let authToken = keyManager.getCookieForApiKey(bearerToken);
    
    if (authToken && authToken.includes('%3A%3A')) {
      authToken = authToken.split('%3A%3A')[1];
    }
    else if (authToken && authToken.includes('::')) {
      authToken = authToken.split('::')[1];
    }

    const checksum = req.headers['x-cursor-checksum'] 
      ?? process.env['x-cursor-checksum'] 
      ?? generateCursorChecksum(authToken.trim());
    const cursorClientVersion = CURSOR_CLIENT_VERSION;

    const availableModelsResponse = await fetch("https://api2.cursor.sh/aiserver.v1.AiService/AvailableModels", {
      method: 'POST',
      headers: {
        'accept-encoding': 'gzip',
        'authorization': `Bearer ${authToken}`,
        'connect-protocol-version': '1',
        'content-type': 'application/proto',
        'user-agent': 'connect-es/1.6.1',
        'x-cursor-checksum': checksum,
        'x-cursor-client-version': cursorClientVersion,
        'x-cursor-config-version': uuidv4(),
        'x-cursor-timezone': 'Asia/Tokyo',
        'x-ghost-mode': 'true',
        'Host': 'api2.cursor.sh',
      },
    })
    const data = await availableModelsResponse.arrayBuffer();
    const buffer = Buffer.from(data);
    try{
      const models = $root.AvailableModelsResponse.decode(buffer).models;

      return res.json({
        object: "list",
        data: models.map(model => ({
          id: model.name,
          created: Date.now(),
          object: 'model',
          owned_by: 'cursor'
        }))
      })
    } catch (error) {
      const text = buffer.toString('utf-8');
      throw new Error(text);      
    }
  }
  catch (error) {
    logger.error(error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
})


router.post('/chat/completions', async (req, res) => {
  // Check if request body exists
  if (!req.body) {
    return res.status(400).json({
      error: 'Request body cannot be empty',
    });
  }

  // Check if model property exists
  if (!req.body.model) {
    return res.status(400).json({
      error: 'Missing required parameter: model',
    });
  }

  // o1 models do not support stream output
  if (typeof req.body.model === 'string' && req.body.model.startsWith('o1-') && req.body.stream) {
    return res.status(400).json({
      error: 'Model not supported stream',
    });
  }

  try {
    const { model, messages, stream = false, tools } = req.body;
    let bearerToken = req.headers.authorization?.replace('Bearer ', '');
    
    // Use keyManager to get actual cookie
    let authToken = keyManager.getCookieForApiKey(bearerToken);
    // Save original cookie for potential error handling
    const originalAuthToken = authToken;
    //console.log('Original cookie:', originalAuthToken);

    if (authToken && authToken.includes('%3A%3A')) {
      authToken = authToken.split('%3A%3A')[1];
    }
    else if (authToken && authToken.includes('::')) {
      authToken = authToken.split('::')[1];
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0 || !authToken) {
      return res.status(400).json({
        error: 'Invalid request. Messages should be a non-empty array and authorization is required',
      });
    }

    const checksum = req.headers['x-cursor-checksum'] 
      ?? process.env['x-cursor-checksum'] 
      ?? generateCursorChecksum(authToken.trim());

    const sessionid = uuidv5(authToken,  uuidv5.DNS);
    const clientKey = generateHashed64Hex(authToken);
    const cursorClientVersion = CURSOR_CLIENT_VERSION;
    
    // Before chat request, call 6 interfaces in sequence
    if (process.env.USE_OTHERS === 'true') {
      try{
        others(authToken, clientKey, checksum, cursorClientVersion, sessionid).then( () => {
          logger.info("Other interfaces async call successful");
        });
      } catch (error) {
        logger.error(error.message);
      }
    }
    
    const cursorBody = generateCursorBody(messages, model, tools);
    
    // Add proxy support
    const dispatcher = config.proxy && config.proxy.enabled
      ? new ProxyAgent(config.proxy.url, { allowH2: true })
      : new Agent({ allowH2: true });

    // Decide whether to use TLS proxy based on .env config
    const useTlsProxy = process.env.USE_TLS_PROXY === 'true';
    
    let response;
    
    try {
      if (useTlsProxy) {
        // Use JA3 fingerprint spoofing proxy
        logger.info(`Using TLS proxy server`);
        response = await fetch('http://localhost:8080/proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: 'https://api2.cursor.sh/aiserver.v1.ChatService/StreamUnifiedChatWithTools',
            method: 'POST',
            headers: {
              'authorization': `Bearer ${authToken}`,
              'connect-accept-encoding': 'gzip',
              'connect-content-encoding': 'gzip',
              'connect-protocol-version': '1',
              'content-type': 'application/connect+proto',
              'user-agent': 'connect-es/1.6.1',
              'x-amzn-trace-id': `Root=${uuidv4()}`,
              'x-client-key': clientKey,
              'x-cursor-checksum': checksum,
              'x-cursor-client-version': cursorClientVersion,
              'x-cursor-config-version': uuidv4(),
              'x-cursor-timezone': 'Asia/Tokyo',
              'x-ghost-mode': 'true',
              'x-request-id': uuidv4(),
              'x-session-id': sessionid,
              'Host': 'api2.cursor.sh',
            },
            body: cursorBody,
            stream: true // Enable stream response
          }),
          timeout: {
            connect: 5000,
            read: 30000
          }
        });
      } else {
        // Direct API call without TLS proxy
        logger.info('Not using TLS proxy, direct API request');
        response = await fetch('https://api2.cursor.sh/aiserver.v1.ChatService/StreamUnifiedChatWithTools', {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${authToken}`,
            'connect-accept-encoding': 'gzip',
            'connect-content-encoding': 'gzip',
            'connect-protocol-version': '1',
            'content-type': 'application/connect+proto',
            'user-agent': 'connect-es/1.6.1',
            'x-amzn-trace-id': `Root=${uuidv4()}`,
            'x-client-key': clientKey,
            'x-cursor-checksum': checksum,
            'x-cursor-client-version': cursorClientVersion,
            'x-cursor-config-version': uuidv4(),
            'x-cursor-timezone': 'Asia/Shanghai',
            'x-ghost-mode': 'true',
            'x-request-id': uuidv4(),
            'x-session-id': sessionid,
            'Host': 'api2.cursor.sh',
          },
          body: cursorBody,
          dispatcher: dispatcher,
          timeout: {
            connect: 5000,
            read: 30000
          }
        });
      }
    } catch (fetchError) {
      logger.error(`Fetch error: ${fetchError.message}`);
      
      // Handle connection timeout error
      const isConnectTimeout = fetchError.cause && 
                             (fetchError.cause.code === 'UND_ERR_CONNECT_TIMEOUT' || 
                              fetchError.message.includes('Connect Timeout Error'));
      
      // Build error response
      const errorMessage = isConnectTimeout 
        ? `⚠️ Connection timeout ⚠️\n\nUnable to connect to API server (api2.cursor.sh). Please check your network connection or try using a proxy.`
        : `⚠️ Request failed ⚠️\n\nError: ${fetchError.message}`;

      if (stream) {
        // Stream response format error
        const responseId = `chatcmpl-${uuidv4()}`;
        res.write(
          `data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: req.body.model || 'unknown',
            choices: [
              {
                index: 0,
                delta: {
                  content: errorMessage,
                },
              },
            ],
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Non-stream response format error
        res.json({
          id: `chatcmpl-${uuidv4()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: req.body.model || 'unknown',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: errorMessage,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        });
      }
      return; // Important: return early
    }

    // Process response
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const responseId = `chatcmpl-${uuidv4()}`;
      
      try {
        let responseEnded = false; // Flag if response ended
        let accumulatedThinking = ''; // Accumulate thinking content
        let accumulatedContent = ''; // Accumulate content
        
        for await (const chunk of response.body) {
          // If response ended, skip subsequent data
          if (responseEnded) {
            continue;
          }
          
          let result = {};
          try {
            result = chunkToUtf8String(chunk);
          } catch (error) {
            logger.error('Failed to parse response chunk:', error);
            // Provide default empty result to avoid downstream errors
            result = {
              reasoning_content: '', 
              content: '',
              error: `Parse error: ${error.message}`
            };
          }
          
          // Check if error object returned
          if (result && typeof result === 'object' && result.error) {
            // Check if contains specific invalid cookie error
            const errorStr = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
            
            // Handle error and get result
            const errorResult = handleCursorError(errorStr, bearerToken, originalAuthToken);
            
            // If cookie should be removed, remove from API Key
            if (errorResult.shouldRemoveCookie) {
              const removed = keyManager.removeCookieFromApiKey(bearerToken, originalAuthToken);
              logger.info(`Cookie removal ${removed ? 'successful' : 'failed'}`);
              
              // If removed successfully, add clear notice to error message
              if (removed) {
                errorResult.message = `⚠️ Cookie has been removed from API Key ⚠️\n\n${errorResult.message}`;
              }
            }
            
            // Return error to client as assistant message
            res.write(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: errorResult.message,
                    },
                  },
                ],
              })}\n\n`
            );
            
            res.write('data: [DONE]\n\n');
            responseEnded = true; // Mark response as ended
            break; // Exit loop, no more processing
          }

          // Process thinking content
          if (result.reasoning_content && result.reasoning_content.length > 0) {
            // Accumulate thinking content
            accumulatedThinking += result.reasoning_content;
            
            // Send accumulated thinking content fragment
            res.write(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      reasoning_content: result.reasoning_content,
                    },
                  },
                ],
              })}\n\n`
            );
          }

          // Process regular content
          if (result.content && result.content.length > 0) {
            // Accumulate content
            accumulatedContent += result.content;

            // Send content
            res.write(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: result.content,
                    },
                  },
                ],
              })}\n\n`
            );
          }
        }
        
        if (!responseEnded) {
          const parsedToolCalls = parseToolCalls(accumulatedContent);
          if (parsedToolCalls.length > 0) {
            res.write(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: parsedToolCalls,
                    },
                    finish_reason: 'tool_calls',
                  },
                ],
              })}\n\n`
            );
          }
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamError) {
        logger.error('Stream error:', streamError);
        // Ensure response not ended before sending error
        if (!res.writableEnded) {
          if (streamError.name === 'TimeoutError') {
            // Send timeout error as assistant message
            const errorMessage = `⚠️ Request timeout ⚠️\n\nError: Server response timeout, please try again later.`;
            res.write(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: errorMessage,
                    },
                  },
                ],
              })}\n\n`
            );
          } else {
            // Send processing error as assistant message
            const errorMessage = `⚠️ Processing error ⚠️\n\nError: Stream processing error, please try again later.\n\n${streamError.message || ''}`;
            res.write(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: errorMessage,
                    },
                  },
                ],
              })}\n\n`
            );
          }
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }
    } else {
      try {
        let text = '';
        let thinkingText = '';
        let responseEnded = false; // Flag if response ended
        
        for await (const chunk of response.body) {
          // If response ended, skip subsequent data
          if (responseEnded) {
            continue;
          }
          
          let result = {};
          try {
            result = chunkToUtf8String(chunk);
          } catch (error) {
            logger.error('Failed to parse non-stream response chunk:', error);
            // Provide default empty result to avoid downstream errors
            result = {
              reasoning_content: '', 
              content: '',
              error: `Parse error: ${error.message}`
            };
          }
          // Output full result for debugging
          //console.log("Received non-stream response:", typeof result, result && typeof result === 'object' ? JSON.stringify(result) : result);
          
          // Check if error object returned
          if (result && typeof result === 'object' && result.error) {
            //console.error('Error response detected:', result.error);
            
            // Check if contains specific invalid cookie error
            const errorStr = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
            
            // Handle error and get result
            const errorResult = handleCursorError(errorStr, bearerToken, originalAuthToken);
            
            // If cookie should be removed, remove from API Key
            if (errorResult.shouldRemoveCookie) {
              const removed = keyManager.removeCookieFromApiKey(bearerToken, originalAuthToken);
              logger.info(`Cookie removal ${removed ? 'successful' : 'failed'}`);
              
              // If removed successfully, add clear notice to error message
              if (removed) {
                errorResult.message = `⚠️ Cookie has been removed from API Key ⚠️\n\n${errorResult.message}`;
              }
            }
            
            // Invalid cookie error, format as assistant message
            res.json({
              id: `chatcmpl-${uuidv4()}`,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: errorResult.message,
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              },
            });
            
            responseEnded = true; // Mark response as ended
            break; // Exit loop, no more processing
          }
          
          // Process thinking content
          if (result.reasoning_content && result.reasoning_content.length > 0) {
            thinkingText += result.reasoning_content;
          }
          
          // Process normal text content
          if (result.content && typeof result.content === 'string') {
            text += result.content;
          }
        }
        
        if (!responseEnded) {
          text = text.replace(/^.*<\|END_USER\|>/s, '');
          text = text.replace(/^\n[a-zA-Z]?/, '').trim();

          const parsedToolCalls = parseToolCalls(text);
          const hasToolCalls = parsedToolCalls.length > 0;
          const cleanedText = hasToolCalls ? stripToolCalls(text) : text;

          res.json({
            id: `chatcmpl-${uuidv4()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  reasoning_content: thinkingText,
                  content: cleanedText,
                  ...(hasToolCalls ? { tool_calls: parsedToolCalls } : {}),
                },
                finish_reason: hasToolCalls ? 'tool_calls' : 'stop',
              },
            ],
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          });
        }
      } catch (error) {
        logger.error('Non-stream error:', error);
        // Ensure response not sent before sending error
        if (!res.headersSent) {
          if (error.name === 'TimeoutError') {
            // Use unified error format
            const errorMessage = `⚠️ Request timeout ⚠️\n\nError: Server response timeout, please try again later.`;
            return res.json({
              id: `chatcmpl-${uuidv4()}`,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: req.body.model || 'unknown',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: errorMessage,
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              },
            });
          }
          throw error;
        }
      }
    }
  } catch (error) {
    logger.error('Error:', error);
    if (!res.headersSent) {
      const errorText = error.name === 'TimeoutError' ? 'Request timeout' : 'Internal server error';
      
      if (req.body.stream) {
        // Stream response format error
        const responseId = `chatcmpl-${uuidv4()}`;
        // Add clear error message
        const errorMessage = `⚠️ Request failed ⚠️\n\nError: ${errorText}, please try again later.\n\n${error.message || ''}`;
        res.write(
          `data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: req.body.model || 'unknown',
            choices: [
              {
                index: 0,
                delta: {
                  content: errorMessage,
                },
              },
            ],
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Non-stream response format error
        // Add clear error message
        const errorMessage = `⚠️ Request failed ⚠️\n\nError: ${errorText}, please try again later.\n\n${error.message || ''}`;
        res.json({
          id: `chatcmpl-${uuidv4()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: req.body.model || 'unknown',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: errorMessage,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        });
      }
    }
  }
});

// Trigger Cookie refresh
router.post("/refresh-cookies", async (req, res) => {
  try {
    // If refresh process already running, return error
    if (refreshStatus.isRunning) {
      return res.status(409).json({
        success: false,
        message: 'A refresh process is already running, please wait for it to complete'
      });
    }
    
    // Get request parameters
    const apiKey = req.query.apiKey || '';
    
    // Reset refresh status
    refreshStatus = {
      isRunning: true,
      status: 'running',
      message: 'Starting refresh process...',
      startTime: new Date(),
      endTime: null,
      error: null
    };
    
    logger.info(`Received Cookie refresh request, API Key: ${apiKey || 'all'}`);
    
    // Build command line args
    const args = [];
    if (apiKey) {
      args.push(apiKey);
    }
    
    // Get absolute path of auto-refresh-cookies.js
    const scriptPath = path.resolve(__dirname, '../../auto-refresh-cookies.js');
    
    // Start child process to run refresh script
    const refreshProcess = spawn('node', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Collect output
    let output = '';
    
    refreshProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      logger.info(`Refresh process output: ${text}`);
      
      // Update status message
      if (text.includes('Starting auto refresh')) {
        refreshStatus.message = 'Refreshing Cookie...';
      } else if (text.includes('Refresh result:')) {
        refreshStatus.message = text.trim();
      }
    });
    
    refreshProcess.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      logger.error(`Refresh process error: ${text}`);
      
      // Update error info
      refreshStatus.error = text.trim();
      refreshStatus.message = `Error: ${text.trim()}`;
    });
    
    refreshProcess.on('close', (code) => {
      logger.info(`Refresh process exited, code: ${code}`);
      
      refreshStatus.isRunning = false;
      refreshStatus.endTime = new Date();
      
      if (code === 0) {
        refreshStatus.status = 'completed';
        
        // Extract success info
        const successMatch = output.match(/Successfully refreshed (\d+)/);
        if (successMatch) {
          refreshStatus.message = `Successfully refreshed ${successMatch[1]} API Key Cookies`;
        } else {
          refreshStatus.message = 'Refresh complete';
        }
        
        // After child process completes, reinitialize API Keys to load new Cookies
        try {
          const keyManager = require('../utils/keyManager');
          logger.info('Child process Cookie refresh complete, reinitializing API Keys in main process...');
          keyManager.initializeApiKeys();
          logger.info('Main process API Keys reload complete');
        } catch (initError) {
          logger.error('Failed to reinitialize API Keys:', initError);
        }
      } else {
        refreshStatus.status = 'failed';
        refreshStatus.message = refreshStatus.error || 'Refresh failed, check server logs';
      }
    });
    
    // Return response immediately, do not wait for refresh
    return res.json({
      success: true,
      message: 'Refresh request accepted, processing in background'
    });
  } catch (error) {
    logger.error('Failed to trigger Cookie refresh:', error);
    
    // Update refresh status
    refreshStatus.isRunning = false;
    refreshStatus.status = 'failed';
    refreshStatus.endTime = new Date();
    refreshStatus.error = error.message;
    refreshStatus.message = `Failed to trigger refresh: ${error.message}`;
    
    return res.status(500).json({
      success: false,
      message: `Failed to trigger refresh: ${error.message}`
    });
  }
});

// Query Cookie refresh status
router.get("/refresh-status", (req, res) => {
  try {
    // Return current refresh status
    return res.json({
      success: true,
      data: {
        ...refreshStatus,
        isRunning: refreshStatus.isRunning || false,
        status: refreshStatus.status || 'unknown',
        message: refreshStatus.message || 'Refresh not triggered',
        startTime: refreshStatus.startTime || null,
        endTime: refreshStatus.endTime || null
      }
    });
  } catch (error) {
    logger.error('Failed to get refresh status:', error);
    return res.status(500).json({
      success: false,
      message: `Failed to get refresh status: ${error.message}`
    });
  }
});

// Generate Cookie retrieval link
router.post('/generate-cookie-link', async (req, res) => {
  try {
    // Verify admin permission
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Auth token not provided'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const authResult = admin.verifyToken(token);
    
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed'
      });
    }
    
    // Generate UUID and PKCE verifier
    const uuid = uuidv4();
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    // Generate login link
    const loginUrl = `https://www.cursor.com/ja/loginDeepControl?challenge=${challenge}&uuid=${uuid}&mode=login`;
    
    // Record request info
    pendingCookieRequests.set(uuid, {
      uuid,
      verifier,
      status: 'waiting',
      created: Date.now(),
      apiKey: req.body.apiKey || '', // Target API Key, empty means all
      lastCheck: Date.now(),
      cookie: null
    });
    
    // Auto cleanup after 60 minutes
    setTimeout(() => {
      if (pendingCookieRequests.has(uuid)) {
        pendingCookieRequests.delete(uuid);
      }
    }, 60 * 60 * 1000);
    
    return res.json({
      success: true,
      url: loginUrl,
      uuid: uuid
    });
  } catch (error) {
    logger.error('Failed to generate Cookie link:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Query Cookie retrieval status
router.get('/check-cookie-status', async (req, res) => {
  try {
    const { uuid } = req.query;
    
    if (!uuid || !pendingCookieRequests.has(uuid)) {
      return res.json({
        success: false,
        status: 'failed',
        message: 'Invalid UUID or request expired'
      });
    }
    
    const request = pendingCookieRequests.get(uuid);
    request.lastCheck = Date.now();
    
    // Check status
    if (request.status === 'waiting') {
      // Check Cursor API for token
      try {
        const apiUrl = `https://api2.cursor.sh/auth/poll?uuid=${uuid}&verifier=${request.verifier}`;
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.210 Safari/537.36',
            'Accept': '*/*',
            'Origin': 'vscode-file://vscode-app',
            'x-ghost-mode': 'true'
          },
          timeout: 5000
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data && data.accessToken) {
            // Cookie obtained
            request.cookie = data.accessToken;
            request.status = 'success';
            
            // Add Cookie to target API Key
            let message = '';
            
            if (request.apiKey) {
              // Add to specific API Key
              const apiKey = request.apiKey;
              const cookies = keyManager.getAllCookiesForApiKey(apiKey) || [];
              cookies.push(request.cookie);
              keyManager.addOrUpdateApiKey(apiKey, cookies);
              message = `Cookie added to API Key: ${apiKey}`;
            } else {
              // Add to all API Keys
              const apiKeys = keyManager.getAllApiKeys();
              for (const apiKey of apiKeys) {
                const cookies = keyManager.getAllCookiesForApiKey(apiKey) || [];
                cookies.push(request.cookie);
                keyManager.addOrUpdateApiKey(apiKey, cookies);
              }
              message = `Cookie added to all API Keys (${apiKeys.length})`;
            }
            
            // Remove from waiting list when done
            pendingCookieRequests.delete(uuid);
            
            return res.json({
              success: true,
              message: message
            });
          }
        }
        
        // If Cookie not obtained, keep waiting
        return res.json({
          success: false,
          status: 'waiting'
        });
        
      } catch (error) {
        logger.error('Failed to query Cursor API:', error);
        // Error occurred but keep waiting, no state change
        return res.json({
          success: false,
          status: 'waiting',
          message: 'Error during polling, continuing to wait'
        });
      }
    } else if (request.status === 'success') {
      // Already successful, return result
      const message = request.apiKey 
        ? `Cookie added to API Key: ${request.apiKey}`
        : `Cookie added to all API Keys`;
      
      // Remove from waiting list when done
      pendingCookieRequests.delete(uuid);
      
      return res.json({
        success: true,
        message: message
      });
    } else {
      // Failed
      pendingCookieRequests.delete(uuid);
      return res.json({
        success: false,
        status: 'failed',
        message: 'Failed to get Cookie'
      });
    }
  } catch (error) {
    logger.error('Failed to check Cookie status:', error);
    return res.status(500).json({
      success: false,
      status: 'failed',
      message: error.message
    });
  }
});

// Get logs API
router.get("/logs", (req, res) => {
  try {
    // Get query parameters
    const level = req.query.level;
    const search = req.query.search;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 100;
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;
    
    // Filter parameters
    const filter = {
      level,
      search,
      page,
      pageSize,
      startTime,
      endTime
    };
    
    // Get logs
    const logs = logger.getLogs(filter);
    
    return res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    logger.error('Failed to get logs:', error);
    return res.status(500).json({
      success: false,
      message: `Failed to get logs: ${error.message}`
    });
  }
});

// Clear memory logs
router.delete("/logs", (req, res) => {
  try {
    logger.clearMemoryLogs();
    return res.json({
      success: true,
      message: 'Logs cleared'
    });
  } catch (error) {
    logger.error('Failed to clear logs:', error);
    return res.status(500).json({
      success: false,
      message: `Failed to clear logs: ${error.message}`
    });
  }
});
async function others(authToken, clientKey, checksum, cursorClientVersion, sessionid){
  try {
    // Define all API endpoint configs
    const endpoints = [
      {
        url: 'https://api2.cursor.sh/aiserver.v1.AiService/CheckFeatureStatus',
        method: 'POST',
        headers: {
          'accept-encoding': 'gzip',
          'authorization': `Bearer ${authToken}`,
          'connect-protocol-version': '1',
          'content-type': 'application/proto',
          'user-agent': 'connect-es/1.6.1',
          'x-client-key': clientKey,
          'x-cursor-checksum': checksum,
          'x-cursor-client-version': cursorClientVersion,
          'x-cursor-config-version': uuidv4(),
          'x-cursor-timezone': 'Asia/Tokyo',
          'x-ghost-mode': 'true',
          'x-new-onboarding-completed': 'false',
          'x-session-id': sessionid,
          'Host': 'api2.cursor.sh',
        },
        body: '', // Actual length 23 bytes
        timeout: {
          connect: 5000,
          read: 30000
        }
      },
      {
        url: 'https://api2.cursor.sh/aiserver.v1.AiService/AvailableDocs',
        method: 'POST',
        headers: {
          'authorization': `Bearer ${authToken}`,
          'connect-accept-encoding': 'gzip',
          'connect-protocol-version': '1',
          'content-type': 'application/proto',
          'user-agent': 'connect-es/1.6.1',
          'x-amzn-trace-id': `Root=${uuidv4()}`,
          'x-client-key': clientKey,
          'x-cursor-checksum': checksum,
          'x-cursor-client-version': cursorClientVersion,
          'x-cursor-config-version': uuidv4(),
          'x-cursor-timezone': 'Asia/Tokyo',
          'x-ghost-mode': 'true',
          'x-request-id': uuidv4(),
          'x-session-id': sessionid,
          'Host': 'api2.cursor.sh',
        },
        timeout: {
          connect: 5000,
          read: 30000
        }
      },
      {
        url: 'https://api2.cursor.sh/aiserver.v1.DashboardService/GetTeams',
        method: 'POST',
        headers: {
          'accept-encoding': 'gzip',
          'authorization': `Bearer ${authToken}`,
          'connect-protocol-version': '1',
          'content-type': 'application/proto',
          'user-agent': 'connect-es/1.6.1',
          'x-amzn-trace-id': `Root=${uuidv4()}`,
          'x-client-key': clientKey,
          'x-cursor-checksum': checksum,
          'x-cursor-client-version': cursorClientVersion,
          'x-cursor-config-version': uuidv4(),
          'x-cursor-timezone': 'Asia/Tokyo',
          'x-ghost-mode': 'true',
          'x-new-onboarding-completed': 'false',
          'x-request-id': uuidv4(),
          'x-session-id': sessionid,
          'Host': 'api2.cursor.sh',
        },
        body: '',
        timeout: {
          connect: 5000,
          read: 30000
        }
      },
      {
        url: 'https://api2.cursor.sh/auth/full_stripe_profile',
        method: 'GET',
        headers: {
          'Host': 'api2.cursor.sh',
          'Connection': 'keep-alive',
          'Authorization': `Bearer ${authToken}`,
          'x-new-onboarding-completed': 'false',
          'x-ghost-mode': 'true',
            'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Cursor/${CURSOR_CLIENT_VERSION} Chrome/132.0.6834.210 Electron/34.3.4 Safari/537.36`,
          'Accept': '*/*',
          'Origin': 'vscode-file://vscode-app',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'zh-CN'
        },
        timeout: {
          connect: 5000,
          read: 30000
        }
      },
      {
        url: 'https://api2.cursor.sh/aiserver.v1.DashboardService/GetUsageBasedPremiumRequests',
        method: 'POST',
        headers: {
          'accept-encoding': 'gzip',
          'authorization': `Bearer ${authToken}`,
          'connect-protocol-version': '1',
          'content-type': 'application/proto',
          'user-agent': 'connect-es/1.6.1',
          'x-client-key': clientKey,
          'x-cursor-checksum': checksum,
          'x-cursor-client-version': cursorClientVersion,
          'x-cursor-config-version': uuidv4(),
          'x-cursor-timezone': 'Asia/Tokyo',
          'x-ghost-mode': 'true',
          'x-new-onboarding-completed': 'false',
          'x-session-id': sessionid,
          'Host': 'api2.cursor.sh',
        },
        body: '',
        timeout: {
          connect: 5000,
          read: 30000
        }
      },
      {
        url: 'https://api2.cursor.sh/aiserver.v1.DashboardService/GetHardLimit',
        method: 'POST',
        headers: {
          'accept-encoding': 'gzip',
          'authorization': `Bearer ${authToken}`,
          'connect-protocol-version': '1',
          'content-type': 'application/proto',
          'user-agent': 'connect-es/1.6.1',
          'x-client-key': clientKey,
          'x-cursor-checksum': checksum,
          'x-cursor-client-version': cursorClientVersion,
          'x-cursor-config-version': uuidv4(),
          'x-cursor-timezone': 'Asia/Tokyo',
          'x-ghost-mode': 'true',
          'x-new-onboarding-completed': 'false',
          'x-session-id': sessionid,
          'Host': 'api2.cursor.sh',
        },
        body: '',
        timeout: {
          connect: 5000,
          read: 30000
        }
      }
    ];

    // Randomly select 2-4 interfaces to call
    const minApis = 2;
    const maxApis = 4;
    const numApisToCall = Math.floor(Math.random() * (maxApis - minApis + 1)) + minApis;
    
    // Shuffle array and take first N elements
    const shuffledEndpoints = [...endpoints].sort(() => 0.5 - Math.random()).slice(0, numApisToCall);
    
    // Check if using auxiliary proxy server
    const useOthersProxy = process.env.USE_OTHERS_PROXY === 'true';
    
    // Use Promise.allSettled so one failure does not affect others
    const results = await Promise.allSettled(shuffledEndpoints.map(async (endpoint) => {
      try {
        let response;
        
        if (useOthersProxy) {
          // Use proxy server
          logger.debug(`Using auxiliary proxy for: ${endpoint.url}`);
          // Build proxy request object
          const proxyPayload = {
            url: endpoint.url,
            method: endpoint.method,
            headers: endpoint.headers,
            body: endpoint.body || undefined,
            stream: false
          };
          
          // Use proxy server
          response = await fetch('http://localhost:10654/proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(proxyPayload),
            // Keep original timeout
            timeout: endpoint.timeout
          });
        } else {
          // Direct request
          logger.debug(`Direct request: ${endpoint.url}`);
          response = await fetch(endpoint.url, {
            method: endpoint.method,
            headers: endpoint.headers,
            body: endpoint.body || undefined,
            timeout: endpoint.timeout
          });
        }
        
        return {
          url: endpoint.url,
          status: response.status,
          success: true
        };
      } catch (error) {
        // Log single request error without interrupting overall flow
        logger.debug(`Other API call failed (${endpoint.url}): ${error.message}`);
        return {
          url: endpoint.url,
          success: false,
          error: error.message
        };
      }
    }));
    
    // Log request result stats
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    logger.debug(`Other API calls complete: ${successCount}/${results.length} successful`);
    
    return true;
  } catch (error) {
    // Log overall error without affecting main flow
    logger.error(`others function execution error: ${error.message}`);
    return false;
  }
}
// Error handling function
function handleCursorError(errorStr, bearerToken, originalAuthToken) {
  let message = '';
  let shouldRemoveCookie = false;
  
  if (errorStr.includes('Not logged in')) {
    // Clearer error logging
    if (originalAuthToken === bearerToken) {
      logger.error(`API Key "${bearerToken}" has no available Cookie, trying backward compatible mode`);
      message = `Error: API Key "${bearerToken}" has no available Cookie. Please add valid Cookie to this API Key or use another valid API Key.\n\nDetails: ${errorStr}`;
    } else {
      logger.error('Invalid cookie detected:', originalAuthToken);
      message = `Error: Cookie is invalid or expired, please update Cookie.\n\nDetails: ${errorStr}`;
    }
    shouldRemoveCookie = true;
  } else if (errorStr.includes('You\'ve reached your trial request limit') || errorStr.includes('You\'ve reached the usage limit for free usage')) {
    logger.error('Cookie quota exhausted:', originalAuthToken);
    message = `Error: Cookie usage limit reached. Please replace Cookie or wait for refresh.\n\nDetails: ${errorStr}`;
    shouldRemoveCookie = true;
  } else if (errorStr.includes('User is unauthorized')) {
    logger.error('Unauthorized cookie detected:', originalAuthToken);
    message = `Error: Cookie has been banned or invalid, please replace Cookie.\n\nDetails: ${errorStr}`;
    shouldRemoveCookie = true;
  } else if (errorStr.includes('suspicious activity checks')) {
    logger.error('IP blacklist detected:', originalAuthToken);
    message = `Error: IP may be blacklisted. Try changing network or using proxy.\n\nDetails: ${errorStr}`;
    shouldRemoveCookie = false;
  } else if (errorStr.includes('Too many computers')) {
    logger.error('Account temporarily banned:', originalAuthToken);
    message = `Error: Account temporarily banned for multi-device login. Try again later or use different account.\n\nDetails: ${errorStr}`;
    shouldRemoveCookie = true;
  } else if (errorStr.includes('Login expired') || errorStr.includes('login expired')) {
    logger.error('Login expired Cookie detected:', originalAuthToken);
    message = `Error: Cookie login has expired, please update Cookie.\n\nDetails: ${errorStr}`;
    shouldRemoveCookie = true;
  } else if(errorStr.includes('your request has been blocked due to the use of a temporary email service for this account')) {
    logger.error('Temporary email detected:', originalAuthToken);
    message = `Error: Request blocked - temporary email service detected. Please use different email.\n\nDetails: ${errorStr}`;
    shouldRemoveCookie = true;
  } else if (errorStr.includes('Your request has been blocked as our system has detected suspicious activity from your account')) {
    logger.error('Account anomaly detected:', originalAuthToken);
    message = `Error: Request blocked - possible false ban. Try retrying/replacing cookie/device.\n\nDetails: ${errorStr}`;
    shouldRemoveCookie = false;
  } else {
    // Non-Cookie related error
    logger.error('Other error detected:', errorStr);
    message = `Error: Request failed.\n\nDetails: ${errorStr}`;
    shouldRemoveCookie = false;
  }
  
  return {
    message,
    shouldRemoveCookie
  };
}

module.exports = router;
