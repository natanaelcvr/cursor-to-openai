const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

/**
 * Extract complete cookies from CSV file
 * @param {string} csvFilePath - CSV file path
 * @returns {Promise<string[]>} - Extracted cookie array
 */
async function extractCookiesFromCsv(csvFilePath) {
  return new Promise((resolve, reject) => {
    try {
      // Check if file exists
      if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV file does not exist: ${csvFilePath}`);
        return resolve([]);
      }

      // Read file content
      const fileContent = fs.readFileSync(csvFilePath, 'utf8');
      console.log(`First 200 characters of file content: ${fileContent.substring(0, 200)}`);

      // Check if file is empty
      if (!fileContent || fileContent.trim() === '') {
        console.error('CSV file is empty');
        return resolve([]);
      }

      // First try to extract all possible cookies directly from file content
      const cookies = [];
      
      // Check for JWT format token (new format)
      const jwtRegex = /ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
      const jwtMatches = fileContent.match(jwtRegex);
      
      if (jwtMatches && jwtMatches.length > 0) {
        console.log(`Extracted ${jwtMatches.length} JWT token format cookies directly from file content`);
        jwtMatches.forEach(match => {
          if (!cookies.includes(match)) {
            cookies.push(match);
          }
        });
      }

      // Check if file content contains keywords
      const hasTokenKeyword = fileContent.includes('token');
      const hasUserPrefix = fileContent.includes('user_');
      console.log(`File contains "token" keyword: ${hasTokenKeyword}`);
      console.log(`File contains "user_" prefix: ${hasUserPrefix}`);

      // If file contains user_ prefix, try to extract old format cookies
      if (hasUserPrefix) {
        const oldFormatCookies = extractCookiesFromText(fileContent);
        if (oldFormatCookies.length > 0) {
          console.log(`Extracted ${oldFormatCookies.length} old format cookies from file content`);
          oldFormatCookies.forEach(cookie => {
            if (!cookies.includes(cookie)) {
              cookies.push(cookie);
            }
          });
        }
      }

      // If cookies already found, return result
      if (cookies.length > 0) {
        console.log(`Total extracted ${cookies.length} cookies`);
        return resolve(validateCookies(cookies));
      }

      // Use csv-parser to parse CSV file
      const possibleTokenFields = ['token', 'cookie', 'value', 'Token', 'Cookie', 'Value', 'jwt', 'JWT'];
      
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          // Check all possible field names
          for (const field of possibleTokenFields) {
            if (row[field]) {
              // Check if JWT format
              if (row[field].startsWith('ey') && row[field].includes('.')) {
                if (!cookies.includes(row[field])) {
                  cookies.push(row[field]);
                }
                break;
              }
              // Check if old format
              else if (row[field].includes('user_')) {
                if (!cookies.includes(row[field])) {
                  cookies.push(row[field]);
                }
                break;
              }
            }
          }
          
          // If no predefined fields found, iterate all fields
          if (cookies.length === 0) {
            for (const field in row) {
              if (row[field] && typeof row[field] === 'string') {
                // Check if JWT format
                if (row[field].startsWith('ey') && row[field].includes('.')) {
                  if (!cookies.includes(row[field])) {
                    cookies.push(row[field]);
                  }
                  break;
                }
                // Check if old format
                else if (row[field].includes('user_')) {
                  if (!cookies.includes(row[field])) {
                    cookies.push(row[field]);
                  }
                  break;
                }
              }
            }
          }
        })
        .on('end', () => {
          console.log(`Extracted ${cookies.length} cookies from CSV parsing`);
          
          // If no cookies found via CSV parsing, try reading line by line
          if (cookies.length === 0) {
            console.log('Attempting to read file line by line...');
            const lines = fileContent.split('\n');
            for (const line of lines) {
              // Check for JWT format token
              if (line.includes('ey')) {
                const jwtMatches = line.match(jwtRegex);
                if (jwtMatches) {
                  jwtMatches.forEach(match => {
                    if (!cookies.includes(match)) {
                      cookies.push(match);
                    }
                  });
                }
              }
              
              // Check for old format cookies
              if (line.includes('user_')) {
                const extractedCookies = extractCookiesFromText(line);
                extractedCookies.forEach(cookie => {
                  if (!cookies.includes(cookie)) {
                    cookies.push(cookie);
                  }
                });
              }
            }
            console.log(`Extracted ${cookies.length} cookies after line-by-line read`);
          }
          
          // Validate extracted cookies are complete
          const validatedCookies = validateCookies(cookies);
          
          resolve(validatedCookies);
        })
        .on('error', (error) => {
          console.error('Error parsing CSV file:', error);
          
          // If cookies already extracted, return directly
          if (cookies.length > 0) {
            console.log(`Parse error but extracted ${cookies.length} cookies, returning after validation`);
            resolve(validateCookies(cookies));
          } else {
            // Otherwise try other extraction methods
            console.log('Trying other methods to extract cookies...');
            
            // Try to extract JWT format token
            const jwtMatches = fileContent.match(jwtRegex);
            if (jwtMatches) {
              jwtMatches.forEach(match => {
                if (!cookies.includes(match)) {
                  cookies.push(match);
                }
              });
            }
            
            // Try to extract old format cookies
            const oldFormatCookies = extractCookiesFromText(fileContent);
            oldFormatCookies.forEach(cookie => {
              if (!cookies.includes(cookie)) {
                cookies.push(cookie);
              }
            });
            
            console.log(`Extracted ${cookies.length} cookies via other methods`);
            resolve(validateCookies(cookies));
          }
        });
    } catch (error) {
      console.error('Error extracting cookies:', error);
      reject(error);
    }
  });
}

/**
 * Extract cookies from text
 * @param {string} text - Text to extract cookies from
 * @returns {string[]} - Extracted cookie array
 */
function extractCookiesFromText(text) {
  const cookies = [];
  
  // Use regex to match user_ prefix cookies (old format)
  const oldFormatRegex = /user_[a-zA-Z0-9%]+%3A%3A[a-zA-Z0-9%\.\_\-]+/g;
  const oldFormatMatches = text.match(oldFormatRegex);
  
  if (oldFormatMatches) {
    oldFormatMatches.forEach(match => {
      if (!cookies.includes(match)) {
        cookies.push(match);
      }
    });
  }
  
  // Use regex to match JWT format cookies starting with ey (new format)
  const jwtRegex = /ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
  const jwtMatches = text.match(jwtRegex);
  
  if (jwtMatches) {
    jwtMatches.forEach(match => {
      if (!cookies.includes(match)) {
        cookies.push(match);
      }
    });
  }
  
  return cookies;
}

/**
 * Validate cookies are complete
 * @param {string[]} cookies - Cookie array to validate
 * @returns {string[]} - Validated cookie array
 */
function validateCookies(cookies) {
  return cookies.filter(cookie => {
    // Check if new format JWT token (starts with ey)
    if (cookie.startsWith('ey') && cookie.includes('.')) {
      const parts = cookie.split('.');
      // Check if JWT has three parts
      if (parts.length === 3) {
        return true; // cookie valid
      } else {
        console.warn(`Incomplete JWT detected (new format): ${cookie}`);
        return false;
      }
    } 
    // Check if old format cookie is complete
    else if (cookie.includes('%3A%3A')) {
      const parts = cookie.split('%3A%3A');
      if (parts.length === 2) {
        const jwt = parts[1];
        // Check if JWT contains two dots (indicating three parts)
        if (jwt.includes('.') && jwt.split('.').length === 3) {
          return true; // cookie complete
        } else {
          console.warn(`Incomplete JWT detected (old format): ${cookie}`);
          return false;
        }
      }
    }
    return true; // For unrecognized format, keep by default
  });
}

module.exports = {
  extractCookiesFromCsv
};
