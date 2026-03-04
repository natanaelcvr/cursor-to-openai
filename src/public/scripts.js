// Modal-related functionality
document.addEventListener('DOMContentLoaded', function() {
    // Get all modals and close buttons
    const modals = document.querySelectorAll('.modal');
    const closeBtns = document.querySelectorAll('.close');
    
    // Function to close all modals
    function closeAllModals() {
        modals.forEach(modal => {
            modal.style.display = 'none';
        });
        document.body.classList.remove('modal-open');
    }
    
    // Add event to each close button
    closeBtns.forEach(btn => {
        btn.onclick = closeAllModals;
    });
    
    // Close when clicking outside modal
    window.onclick = function(event) {
        modals.forEach(modal => {
            if (event.target == modal) {
                closeAllModals();
            }
        });
    }
    
    // Load API Key list and invalid cookie list on page load
    checkAuth();
    loadApiKeys();
    renderInvalidCookies();
    populateRefreshApiKeySelect();
    populateCookieApiKeySelect();
    
    // Initialize add Cookie tag container
    renderAddCookieTags([]);
    
    // Bind event listeners
    bindEventListeners();

    // Handle logs button click
    document.getElementById('logsBtn')?.addEventListener('click', function() {
        window.location.href = '/logs.html';
    });
});

// Bind various event listeners
function bindEventListeners() {
    // Form submit
    document.getElementById('addKeyForm').addEventListener('submit', handleAddKeyForm);
    document.getElementById('editCookieForm').addEventListener('submit', handleEditCookieForm);
    document.getElementById('invalidCookieForm').addEventListener('submit', handleInvalidCookieForm);
    
    // Button clicks
    // Note: testApiBtn may appear twice on page, check if element exists
    const testApiButtons = document.querySelectorAll('#testApiBtn');
    testApiButtons.forEach(btn => {
        if(btn) btn.addEventListener('click', testApiConnection);
    });
    
    const clearCacheButtons = document.querySelectorAll('#clearCacheBtn');
    clearCacheButtons.forEach(btn => {
        if(btn) btn.addEventListener('click', clearCacheAndRefresh);
    });
    
    // Other buttons
    if(document.getElementById('addNewCookieBtn')) document.getElementById('addNewCookieBtn').addEventListener('click', handleAddNewCookie);
    if(document.getElementById('addCookieBtn')) document.getElementById('addCookieBtn').addEventListener('click', handleAddCookie);
    if(document.getElementById('addInvalidCookieBtn')) document.getElementById('addInvalidCookieBtn').addEventListener('click', handleAddInvalidCookie);
    if(document.getElementById('closeInvalidCookieModal')) document.getElementById('closeInvalidCookieModal').addEventListener('click', closeInvalidCookieModal);
    
    // Fix refresh Cookie and generate link button event binding
    const refreshCookieBtn = document.getElementById('refreshCookieBtn');
    if(refreshCookieBtn) {
        console.log('Binding event to refreshCookieBtn');
        refreshCookieBtn.addEventListener('click', handleRefreshCookie);
    }
    
    const generateLinkBtn = document.getElementById('generateLinkBtn');
    if(generateLinkBtn) {
        console.log('Binding event to generateLinkBtn');
        generateLinkBtn.addEventListener('click', handleGenerateLink);
    }
    
    if(document.getElementById('logoutBtn')) document.getElementById('logoutBtn').addEventListener('click', handleLogout);
}

// API Key management functions
// Load existing API Keys
async function loadApiKeys() {
    try {
        console.log('Loading API Keys...');
        const response = await fetch('/v1/api-keys', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        
        console.log('API response status:', response.status);
        const data = await response.json();
        console.log('Fetched data:', data);
        
        const keyList = document.getElementById('keyList');
        keyList.innerHTML = '';
        
        if (data.success && data.apiKeys.length > 0) {
            data.apiKeys.forEach(key => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td data-title="API Key">${key.key}</td>
                    <td data-title="Cookie Count">${key.cookieCount}</td>
                    <td data-title="Actions">
                        <button class="edit-btn" onclick="editApiKey('${key.key}')">Edit</button>
                        <button class="action-btn" onclick="deleteApiKey('${key.key}')">Delete</button>
                    </td>
                `;
                keyList.appendChild(row);
            });
        } else {
            keyList.innerHTML = '<tr><td colspan="3" data-title="Status">No API Keys</td></tr>';
        }
    } catch (error) {
        console.error('Failed to load API Keys:', error);
        document.getElementById('keyListMessage').innerHTML = `
            <div class="error">Failed to load API Keys: ${error.message}</div>
        `;
    }
}

// Handle add/update API Key form submission
async function handleAddKeyForm(e) {
    e.preventDefault();
    
    const apiKey = document.getElementById('apiKey').value.trim();
    const cookieValuesText = document.getElementById('cookieValues').value.trim();
    
    if (!apiKey) {
        document.getElementById('addKeyMessage').innerHTML = `
            <div class="error">API Key cannot be empty</div>
        `;
        return;
    }
    
    // Convert comma-separated Cookie values to array
    const cookieValues = cookieValuesText ? 
        cookieValuesText.split(',').map(cookie => cookie.trim()).filter(cookie => cookie) : 
        [];
    
    try {
        const response = await fetch('/v1/api-keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                apiKey,
                cookieValues,
            }),
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('addKeyMessage').innerHTML = `
                <div class="info">API Key added/updated successfully</div>
            `;
            // Wait 3 seconds then refresh page
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } else {
            document.getElementById('addKeyMessage').innerHTML = `
                <div class="error">API Key add/update failed: ${data.error}</div>
            `;
        }
    } catch (error) {
        console.error('Add/update API Key failed:', error);
        document.getElementById('addKeyMessage').innerHTML = `
            <div class="error">Add/update API Key failed: ${error.message}</div>
        `;
    }
}

// Delete API Key
async function deleteApiKey(apiKey) {
    if (!confirm(`Are you sure you want to delete API Key "${apiKey}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/v1/api-keys/${encodeURIComponent(apiKey)}`, {
            method: 'DELETE',
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('keyListMessage').innerHTML = `
                <div class="info">API Key deleted successfully</div>
            `;
            loadApiKeys();
        } else {
            document.getElementById('keyListMessage').innerHTML = `
                <div class="error">API Key delete failed: ${data.error}</div>
            `;
        }
    } catch (error) {
        console.error('Delete API Key failed:', error);
        document.getElementById('keyListMessage').innerHTML = `
            <div class="error">Delete API Key failed: ${error.message}</div>
        `;
    }
}

// Get Cookie values for API Key
async function getCookiesForApiKey(apiKey) {
    try {
        const response = await fetch(`/v1/api-keys/${encodeURIComponent(apiKey)}/cookies`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.cookies;
    } catch (error) {
        console.error(`Failed to get Cookie values for ${apiKey}:`, error);
        throw error;
    }
}

// Edit API Key
async function editApiKey(apiKey) {
    try {
        document.getElementById('editModalMessage').innerHTML = '';
        document.getElementById('editApiKey').value = apiKey;
        
        // Get current Cookie values
        const cookies = await getCookiesForApiKey(apiKey);
        
        // Update hidden textarea
        document.getElementById('editCookieValues').value = cookies.join(',');
        
        // Update Cookie tag container
        renderCookieTags(cookies);
        
        // Clear new Cookie input
        document.getElementById('newCookie').value = '';
        
        // Show modal
        const modal = document.getElementById('editModal');
        modal.style.display = 'block';
        document.body.classList.add('modal-open');
        
    } catch (error) {
        console.error('Failed to open edit modal:', error);
        document.getElementById('editModalMessage').innerHTML = `
            <div class="error">Unable to load Cookie data: ${error.message}</div>
        `;
        const modal = document.getElementById('editModal');
        modal.style.display = 'block'; // Show modal even on error to display error message
        document.body.classList.add('modal-open');
    }
}

// Helper to get API Keys
async function getApiKeys() {
    const response = await fetch('/v1/api-keys', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.success ? data.apiKeys : [];
}

// Generic function to copy text to clipboard
async function copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        
        // If navigator.clipboard unavailable, use fallback
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            
            // Make element invisible
            textArea.style.position = 'fixed';
            textArea.style.top = '0';
            textArea.style.left = '0';
            textArea.style.width = '2em';
            textArea.style.height = '2em';
            textArea.style.padding = '0';
            textArea.style.border = 'none';
            textArea.style.outline = 'none';
            textArea.style.boxShadow = 'none';
            textArea.style.background = 'transparent';
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch (fallbackErr) {
            console.error('Fallback copy method failed:', fallbackErr);
            return false;
        }
    }
}

// Show copy success toast
function showCopyToast(success) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '4px';
    toast.style.zIndex = '9999';
    toast.style.fontSize = '14px';
    
    if (success) {
        toast.style.backgroundColor = '#28a745';
        toast.style.color = 'white';
        toast.textContent = 'Copy successful';
    } else {
        toast.style.backgroundColor = '#dc3545';
        toast.style.color = 'white';
        toast.textContent = 'Copy failed, please copy manually';
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 500);
    }, 2000);
}

// Handle copy Cookie button click
async function handleCopyCookie(cookie) {
    const success = await copyTextToClipboard(cookie);
    showCopyToast(success);
}

// Cookie management functions
// Render Cookie tags
function renderCookieTags(cookies) {
    const container = document.getElementById('cookieTagsContainer');
    container.innerHTML = '';
    
    if (cookies.length === 0) {
        container.innerHTML = '<div style="padding: 10px; color: #666;">No cookies, please add some</div>';
        return;
    }
    
    cookies.forEach((cookie, index) => {
        // Create tag
        const tag = document.createElement('span');
        tag.className = 'cookie-tag';
        
        // Add special class for short text
        if (cookie.length < 5) {
            tag.classList.add('short-cookie');
        }
        
        // Truncate Cookie for display
        const displayText = cookie.length > 20 ? 
            cookie.substring(0, 8) + '...' + cookie.substring(cookie.length - 8) : 
            cookie;
        
        tag.title = cookie; // Full Cookie as tooltip
        
        // Mobile-friendly structure with copy button
        tag.innerHTML = `
            <span class="cookie-text-content">${displayText}</span>
            <div class="cookie-buttons">
                <button type="button" class="copy-btn" data-cookie="${cookie}" aria-label="Copy">C</button>
                <button type="button" class="delete-cookie" data-index="${index}" aria-label="Delete">×</button>
            </div>
        `;
        container.appendChild(tag);
    });
    
    // Add delete button event listeners
    document.querySelectorAll('.delete-cookie').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            deleteCookieTag(index);
        });
    });
    
    // Add copy button event listeners
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const cookie = this.getAttribute('data-cookie');
            handleCopyCookie(cookie);
        });
    });
}

// Delete Cookie tag
function deleteCookieTag(index) {
    // Get current cookies from hidden textarea
    const cookieValuesElem = document.getElementById('editCookieValues');
    let cookies = cookieValuesElem.value.split(',').map(c => c.trim()).filter(c => c);
    
    // Remove cookie at specified index
    cookies.splice(index, 1);
    
    // Update hidden textarea
    cookieValuesElem.value = cookies.join(',');
    
    // Re-render tags
    renderCookieTags(cookies);
}

// Handle add new Cookie
function handleAddCookie() {
    const newCookieInput = document.getElementById('newCookie');
    const newCookie = newCookieInput.value.trim();
    
    if (!newCookie) {
        return;
    }
    
    // Get current cookies
    const cookieValuesElem = document.getElementById('editCookieValues');
    let cookies = cookieValuesElem.value ? 
        cookieValuesElem.value.split(',').map(c => c.trim()).filter(c => c) : 
        [];
    
    // Add new cookie
    cookies.push(newCookie);
    
    // Update hidden textarea
    cookieValuesElem.value = cookies.join(',');
    
    // Re-render tags
    renderCookieTags(cookies);
    
    // Clear input
    newCookieInput.value = '';
}

// Handle edit form submission
async function handleEditCookieForm(e) {
    e.preventDefault();
    
    const apiKey = document.getElementById('editApiKey').value.trim();
    const cookieValuesText = document.getElementById('editCookieValues').value.trim();
    
    if (!apiKey) {
        document.getElementById('editModalMessage').innerHTML = `
            <div class="error">API Key cannot be empty</div>
        `;
        return;
    }
    
    // Convert comma-separated Cookie values to array
    const cookieValues = cookieValuesText ? 
        cookieValuesText.split(',').map(cookie => cookie.trim()).filter(cookie => cookie) : 
        [];
    
    try {
        const response = await fetch('/v1/api-keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                apiKey,
                cookieValues,
            }),
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('editModalMessage').innerHTML = `
                <div class="info">Cookie modified successfully</div>
            `;
            setTimeout(() => {
                document.getElementById('editModal').style.display = 'none';
                loadApiKeys();
            }, 1500);
        } else {
            document.getElementById('editModalMessage').innerHTML = `
                <div class="error">Cookie modification failed: ${data.error}</div>
            `;
        }
    } catch (error) {
        console.error('Modify Cookie failed:', error);
        document.getElementById('editModalMessage').innerHTML = `
            <div class="error">Modify Cookie failed: ${error.message}</div>
        `;
    }
}

// Render Cookie tags in add API Key form
function renderAddCookieTags(cookies) {
    const container = document.getElementById('addCookieTagsContainer');
    container.innerHTML = '';
    
    if (cookies.length === 0) {
        container.innerHTML = '<div style="padding: 10px; color: #666;">No cookies, please add some</div>';
        return;
    }
    
    cookies.forEach((cookie, index) => {
        const tag = document.createElement('span');
        tag.className = 'cookie-tag';
        
        // Add special class for short text
        if (cookie.length < 5) {
            tag.classList.add('short-cookie');
        }
        
        const displayText = cookie.length > 20 ? 
            cookie.substring(0, 8) + '...' + cookie.substring(cookie.length - 8) : 
            cookie;
        
        tag.title = cookie;
        
        // Mobile-friendly structure with copy button
        tag.innerHTML = `
            <span class="cookie-text-content">${displayText}</span>
            <div class="cookie-buttons">
                <button type="button" class="copy-btn" data-cookie="${cookie}" aria-label="Copy">C</button>
                <button type="button" class="delete-add-cookie" data-index="${index}" aria-label="Delete">×</button>
            </div>
        `;
        container.appendChild(tag);
    });
    
    document.querySelectorAll('.delete-add-cookie').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            deleteAddCookieTag(index);
        });
    });
    
    // Add copy button event listeners
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const cookie = this.getAttribute('data-cookie');
            handleCopyCookie(cookie);
        });
    });
}

// Delete Cookie tag from add form
function deleteAddCookieTag(index) {
    const cookieValuesElem = document.getElementById('cookieValues');
    let cookies = cookieValuesElem.value ? 
        cookieValuesElem.value.split(',').map(c => c.trim()).filter(c => c) : 
        [];
    
    cookies.splice(index, 1);
    cookieValuesElem.value = cookies.join(',');
    renderAddCookieTags(cookies);
}

// Handle add new Cookie tag to add form
function handleAddNewCookie() {
    const newCookieInput = document.getElementById('addNewCookie');
    const newCookie = newCookieInput.value.trim();
    
    if (!newCookie) {
        return;
    }
    
    const cookieValuesElem = document.getElementById('cookieValues');
    let cookies = cookieValuesElem.value ? 
        cookieValuesElem.value.split(',').map(c => c.trim()).filter(c => c) : 
        [];
    
    cookies.push(newCookie);
    cookieValuesElem.value = cookies.join(',');
    renderAddCookieTags(cookies);
    newCookieInput.value = '';
}

// Invalid Cookie management functions
// Get invalid Cookie list
async function getInvalidCookies() {
    try {
        const response = await fetch('/v1/invalid-cookies', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.invalidCookies;
    } catch (error) {
        console.error('Failed to get invalid cookies:', error);
        throw error;
    }
}

// Clear specific invalid Cookie
async function clearInvalidCookie(cookie) {
    try {
        const response = await fetch(`/v1/invalid-cookies/${encodeURIComponent(cookie)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Failed to clear invalid cookie:', error);
        throw error;
    }
}

// Clear all invalid cookies
async function clearAllInvalidCookies() {
    try {
        const response = await fetch('/v1/invalid-cookies', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Failed to clear all invalid cookies:', error);
        throw error;
    }
}

// Render invalid Cookie list
async function renderInvalidCookies() {
    const container = document.getElementById('invalidCookiesContainer');
    
    try {
        const invalidCookies = await getInvalidCookies();
        
        if (invalidCookies.length === 0) {
            container.innerHTML = '<div class="info">No invalid cookies detected</div>';
            return;
        }
        
        let html = '<div class="table-responsive"><table><thead><tr><th>Invalid Cookie</th><th>Count</th><th>Actions</th></tr></thead><tbody>';
        
        // Display as single row, similar to API Key list
        html += `
            <tr>
                <td data-title="Invalid Cookie">Invalid Cookie</td>
                <td data-title="Count">${invalidCookies.length}</td>
                <td data-title="Actions">
                    <button class="edit-btn" id="editInvalidCookiesBtn">Edit</button>
                    <button class="action-btn" id="clearAllInvalidCookiesInTable">Delete</button>
                </td>
            </tr>
        `;
        
        html += '</tbody></table></div>';
        container.innerHTML = html;
        
        // Add button event listeners
        document.getElementById('editInvalidCookiesBtn').addEventListener('click', openInvalidCookieModal);
        document.getElementById('clearAllInvalidCookiesInTable').addEventListener('click', handleClearAllInvalidCookies);
        
    } catch (error) {
        container.innerHTML = `<div class="error">Load failed: ${error.message}</div>`;
    }
}

// Handle clear all invalid cookies button
async function handleClearAllInvalidCookies() {
    try {
        await clearAllInvalidCookies();
        showMessage('invalidCookiesContainer', 'All invalid cookies cleared', 'info');
        renderInvalidCookies(); // Re-render list
    } catch (error) {
        showMessage('invalidCookiesContainer', `Clear failed: ${error.message}`, 'error');
    }
}

// API test functions
// Test API connection
async function testApiConnection() {
    const resultDiv = document.getElementById('testApiResult');
    resultDiv.innerHTML = '<div class="info">Testing API connection...</div>';
    
    try {
        const response = await fetch('/v1/api-keys', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        resultDiv.innerHTML = `<div class="info">API response status: ${response.status}</div>`;
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        resultDiv.innerHTML += `<div class="info">Fetched data: ${JSON.stringify(data)}</div>`;
    } catch (error) {
        console.error('API test failed:', error);
        resultDiv.innerHTML = `<div class="error">API test failed: ${error.message}</div>`;
    }
}

// Clear cache and refresh
function clearCacheAndRefresh() {
    // Clear cache
    if ('caches' in window) {
        caches.keys().then(function(names) {
            for (let name of names) {
                caches.delete(name);
            }
        });
    }
    
    // Force refresh page (bypass cache)
    window.location.reload(true);
}

// Generic function to show message
function showMessage(containerId, message, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="${type}">${message}</div>`;
}

// Cookie refresh functions
// Populate refresh API Key dropdown
async function populateRefreshApiKeySelect() {
    try {
        const apiKeys = await getApiKeys();
        const select = document.getElementById('refreshApiKey');
        
        // Clear existing options (keep "All API Keys" option)
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Add API Key options
        apiKeys.forEach(key => {
            const option = document.createElement('option');
            option.value = key.key;
            option.textContent = `${key.key} (${key.cookieCount} cookies)`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load API Key options:', error);
    }
}

// Handle refresh Cookie button
async function handleRefreshCookie() {
    console.log('Refresh Cookie button clicked');
    const refreshBtn = document.getElementById('refreshCookieBtn');
    const apiKey = document.getElementById('refreshApiKey').value;
    const statusContainer = document.getElementById('refreshStatusContainer');
    const statusText = document.getElementById('refreshStatus');
    const progressBar = document.getElementById('refreshProgress');
    
    // Show debug info
    showMessage('refreshCookieMessage', 'Preparing to send request...', 'info');
    
    // Disable button, show status container
    refreshBtn.disabled = true;
    statusContainer.style.display = 'block';
    statusText.textContent = 'Sending refresh request...';
    progressBar.value = 10;
    
    try {
        // Build request URL
        let url = '/v1/refresh-cookies';
        if (apiKey) {
            url += `?apiKey=${encodeURIComponent(apiKey)}`;
        }
        
        // Send refresh request
        statusText.textContent = 'Sending refresh request...';
        progressBar.value = 20;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        
        // Show long wait message
        statusText.textContent = 'Refresh request sent, please wait 2-12 minutes...';
        progressBar.value = 50;
        showMessage('refreshCookieMessage', 'Refresh request sent. Fetching new Cookies from Cursor may take 2-12 minutes. You may close this page and check back later.', 'info');
        
        // Start periodic refresh status check
        let checkInterval = setInterval(async () => {
            try {
                const statusResponse = await fetch('/v1/refresh-status', {
                    method: 'GET',
                    headers: {
                        'Cache-Control': 'no-cache'
                    }
                });
                
                if (!statusResponse.ok) {
                    throw new Error(`HTTP error: ${statusResponse.status} ${statusResponse.statusText}`);
                }
                
                const statusData = await statusResponse.json();
                const refreshData = statusData.data;
                
                // Update status info
                statusText.textContent = refreshData.message || 'Refreshing...';
                
                // Update progress bar and UI based on status
                if (refreshData.status === 'completed') {
                    // Refresh complete
                    progressBar.value = 100;
                    statusText.textContent = `Refresh complete: ${refreshData.message}`;
                    clearInterval(checkInterval);
                    
                    // Reload API Key list
                    await loadApiKeys();
                    await populateRefreshApiKeySelect();
                    
                    // Show success message
                    showMessage('refreshCookieMessage', `Refresh complete: ${refreshData.message}`, 'success');
                    
                    // Enable button
                    refreshBtn.disabled = false;
                    
                    // Hide status container after 3 seconds
                    setTimeout(() => {
                        statusContainer.style.display = 'none';
                    }, 3000);
                } else if (refreshData.status === 'failed') {
                    // Refresh failed
                    progressBar.value = 0;
                    statusText.textContent = `Refresh failed: ${refreshData.message}`;
                    clearInterval(checkInterval);
                    
                    // Show error message
                    showMessage('refreshCookieMessage', `Refresh failed: ${refreshData.message}`, 'error');
                    
                    // Enable button
                    refreshBtn.disabled = false;
                } else if (refreshData.status === 'running') {
                    // Refreshing
                    progressBar.value = 75;
                } else if (!refreshData.isRunning) {
                    // Unknown state but not running
                    clearInterval(checkInterval);
                    refreshBtn.disabled = false;
                }
            } catch (error) {
                console.error('Failed to check refresh status:', error);
            }
        }, 5000); // Check every 5 seconds
        
        // Set timeout - stop checking after 12 minutes if not complete
        setTimeout(() => {
            if (checkInterval) {
                clearInterval(checkInterval);
                refreshBtn.disabled = false;
                statusContainer.style.display = 'none';
            }
        }, 720000);
    } catch (error) {
        console.error('Refresh Cookie failed:', error);
        statusText.textContent = 'Failed to send refresh request';
        progressBar.value = 0;
        showMessage('refreshCookieMessage', `Failed to send refresh request: ${error.message}`, 'error');
        refreshBtn.disabled = false;
    }
}

// Get Cookie functions
// Populate API Key dropdown for Cookie retrieval
function populateCookieApiKeySelect() {
    populateRefreshApiKeySelect().then(() => {
        // Copy refreshApiKey options to targetApiKey
        const sourceSelect = document.getElementById('refreshApiKey');
        const targetSelect = document.getElementById('targetApiKey');
        
        // Keep first option ("All API Keys")
        while (targetSelect.options.length > 1) {
            targetSelect.remove(1);
        }
        
        // Copy options
        for (let i = 1; i < sourceSelect.options.length; i++) {
            const option = document.createElement('option');
            option.value = sourceSelect.options[i].value;
            option.textContent = sourceSelect.options[i].textContent;
            targetSelect.appendChild(option);
        }
    });
}

// Handle generate login link
async function handleGenerateLink() {
    console.log('Generate login link button clicked');
    const messageContainer = document.getElementById('getCookieMessage');
    const linkContainer = document.getElementById('loginLinkContainer');
    const loginLink = document.getElementById('loginLink');
    const pollStatusText = document.getElementById('pollStatusText');
    const pollProgress = document.getElementById('pollProgress');
    const targetApiKey = document.getElementById('targetApiKey').value;

    try {
        // Show loading state
        messageContainer.innerHTML = '<div class="info">Generating login link...</div>';
        
        // Request to generate login link
        const response = await fetch('/v1/generate-cookie-link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({ apiKey: targetApiKey })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to generate link');
        }
        
        // Show link
        loginLink.href = data.url;
        loginLink.textContent = data.url;
        linkContainer.style.display = 'block';
        
        // Update status
        pollStatusText.textContent = 'Waiting for user login...';
        pollProgress.value = 10;
        
        // Start polling for cookie status
        messageContainer.innerHTML = '<div class="info">Link generated. Click the link to log in to Cursor and authorize</div>';
        
        // Start polling cookie status
        pollForCookieStatus(data.uuid);
        
    } catch (error) {
        console.error('Failed to generate login link:', error);
        messageContainer.innerHTML = `<div class="error">Failed to generate link: ${error.message}</div>`;
    }
}

// Poll for Cookie retrieval status
function pollForCookieStatus(uuid) {
    const messageContainer = document.getElementById('getCookieMessage');
    const pollStatusText = document.getElementById('pollStatusText');
    const pollProgress = document.getElementById('pollProgress');
    const maxAttempts = 300; // Max 300 attempts, ~5 minutes
    let attempt = 0;
    
    // Update status display
    pollStatusText.textContent = 'Waiting for user login...';
    
    const interval = setInterval(function() {
        attempt++;
        
        try {
            // Update progress bar (10%-90% indicates waiting)
            pollProgress.value = 10 + Math.min(80, attempt / 3.75); // Adjust progress bar speed for 5 min
            
            // Request to check status
            fetch(`/v1/check-cookie-status?uuid=${encodeURIComponent(uuid)}`, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            }).then(function(response) {
                if (!response.ok) {
                    pollStatusText.textContent = `Request failed: ${response.status}`;
                    return;
                }
                
                return response.json();
            }).then(function(data) {
                if (data.success) {
                    // Cookie obtained successfully
                    clearInterval(interval);
                    pollProgress.value = 100;
                    pollStatusText.textContent = 'Cookie obtained successfully!';
                    messageContainer.innerHTML = `<div class="info">Cookie obtained and added successfully!${data.message || ''}</div>`;
                    
                    // Refresh API Keys list
                    loadApiKeys();
                    populateCookieApiKeySelect();
                    
                } else if (data.status === 'waiting') {
                    // Continue waiting
                    pollStatusText.textContent = 'Waiting for user login...';
                } else if (data.status === 'failed') {
                    // Get failed
                    clearInterval(interval);
                    pollStatusText.textContent = 'Get failed';
                    pollProgress.value = 0;
                    messageContainer.innerHTML = `<div class="error">Failed to get Cookie: ${data.message || 'Unknown error'}</div>`;
                }
            }).catch(function(error) {
                console.error('Cookie status poll failed:', error);
                pollStatusText.textContent = `Poll error: ${error.message}`;
            });
            
        } catch (error) {
            console.error('Cookie status poll error:', error);
            pollStatusText.textContent = `Poll error: ${error.message}`;
        }
        
        // Stop after max attempts
        if (attempt >= maxAttempts) {
            clearInterval(interval);
            pollStatusText.textContent = 'Timeout, please retry';
            pollProgress.value = 0;
            messageContainer.innerHTML = '<div class="error">Cookie acquisition timeout, please try again</div>';
        }
        
    }, 1000); // Poll every second
}

// Auth functions
// Check login status
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    // Verify token
    fetch('/v1/admin/verify', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            localStorage.removeItem('adminToken');
            window.location.href = '/login.html';
        } else {
            // Update to new username display
            const usernameElem = document.getElementById('usernameText');
            if (usernameElem) {
                usernameElem.textContent = data.username;
            } else {
                // Fallback for old template without usernameText
                const adminElem = document.getElementById('adminUsername');
                if (adminElem) {
                    adminElem.textContent = `Admin: ${data.username}`;
                }
            }
        }
    })
    .catch(error => {
        console.error('Verification failed:', error);
        localStorage.removeItem('adminToken');
        window.location.href = '/login.html';
    });
}

// Handle logout
function handleLogout() {
    localStorage.removeItem('adminToken');
    window.location.href = '/login.html';
}

// Add token to all API requests
function addAuthHeader(headers = {}) {
    const token = localStorage.getItem('adminToken');
    return {
        ...headers,
        'Authorization': `Bearer ${token}`
    };
}

// Modify all fetch requests to add token
(function() {
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        // Add token only for admin page API requests
        if (url.includes('/v1/api-keys') || 
            url.includes('/v1/invalid-cookies') || 
            url.includes('/v1/refresh-cookies') ||
            url.includes('/v1/generate-cookie-link') ||
            url.includes('/v1/check-cookie-status') ||
            url.includes('/v1/logs')) {
            options.headers = addAuthHeader(options.headers);
        }
        return originalFetch(url, options);
    };
})();

// Invalid Cookie modal functions
// Open invalid Cookie modal
async function openInvalidCookieModal() {
    try {
        document.getElementById('invalidCookieModalMessage').innerHTML = '';
        const invalidCookies = await getInvalidCookies();
        renderInvalidCookieTags(invalidCookies);
        document.getElementById('invalidCookiesValues').value = invalidCookies.join(',');
        document.getElementById('newInvalidCookie').value = '';
        const modal = document.getElementById('invalidCookieModal');
        modal.style.display = 'block';
        document.body.classList.add('modal-open');
    } catch (error) {
        console.error('Failed to open invalid Cookie modal:', error);
        showMessage('invalidCookiesContainer', `Failed to load invalid cookies: ${error.message}`, 'error');
    }
}

// Close invalid Cookie modal
function closeInvalidCookieModal() {
    const modal = document.getElementById('invalidCookieModal');
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
}

// Render invalid Cookie tags
function renderInvalidCookieTags(cookies) {
    const container = document.getElementById('invalidCookieTagsContainer');
    container.innerHTML = '';
    
    if (cookies.length === 0) {
        container.innerHTML = '<div style="padding: 10px; color: #666;">No invalid cookies</div>';
        return;
    }
    
    cookies.forEach((cookie, index) => {
        // Create tag
        const tag = document.createElement('span');
        tag.className = 'cookie-tag';
        
        // Add special class for short text
        if (cookie.length < 5) {
            tag.classList.add('short-cookie');
        }
        
        // Truncate Cookie for display
        const displayText = cookie.length > 20 ? 
            cookie.substring(0, 8) + '...' + cookie.substring(cookie.length - 8) : 
            cookie;
        
        tag.title = cookie; // Full Cookie as tooltip
        
        // Use same delete button style as API Key
        tag.innerHTML = `
            <span class="cookie-text-content">${displayText}</span>
            <div class="cookie-buttons">
                <button type="button" class="copy-btn" data-cookie="${cookie}" aria-label="Copy">C</button>
                <button type="button" class="delete-cookie" data-index="${index}" aria-label="Delete">×</button>
            </div>
        `;
        container.appendChild(tag);
    });
    
    // Add delete button event listeners
    document.querySelectorAll('#invalidCookieTagsContainer .delete-cookie').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            deleteInvalidCookieTag(index);
        });
    });
    
    // Add copy button event listeners
    document.querySelectorAll('#invalidCookieTagsContainer .copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const cookie = this.getAttribute('data-cookie');
            handleCopyCookie(cookie);
        });
    });
}

// Delete invalid Cookie tag
function deleteInvalidCookieTag(index) {
    // Get current cookies from hidden textarea
    const cookieValuesElem = document.getElementById('invalidCookiesValues');
    let cookies = cookieValuesElem.value.split(',').map(c => c.trim()).filter(c => c);
    
    // Remove cookie at specified index
    cookies.splice(index, 1);
    
    // Update hidden textarea
    cookieValuesElem.value = cookies.join(',');
    
    // Re-render tags
    renderInvalidCookieTags(cookies);
}

// Handle add new invalid Cookie
function handleAddInvalidCookie() {
    const newCookieInput = document.getElementById('newInvalidCookie');
    const newCookie = newCookieInput.value.trim();
    
    if (!newCookie) {
        return;
    }
    
    // Get current cookies
    const cookieValuesElem = document.getElementById('invalidCookiesValues');
    let cookies = cookieValuesElem.value ? 
        cookieValuesElem.value.split(',').map(c => c.trim()).filter(c => c) : 
        [];
    
    // Add new cookie
    cookies.push(newCookie);
    
    // Update hidden textarea
    cookieValuesElem.value = cookies.join(',');
    
    // Re-render tags
    renderInvalidCookieTags(cookies);
    
    // Clear input
    newCookieInput.value = '';
}

// Handle invalid Cookie edit form submission
async function handleInvalidCookieForm(e) {
    e.preventDefault();
    
    const cookieValuesText = document.getElementById('invalidCookiesValues').value.trim();
    
    // Convert comma-separated Cookie values to array
    const invalidCookies = cookieValuesText ? 
        cookieValuesText.split(',').map(cookie => cookie.trim()).filter(cookie => cookie) : 
        [];
    
    try {
        // First clear all invalid cookies
        await clearAllInvalidCookies();
        
        // If new invalid cookies, add each one
        if (invalidCookies.length > 0) {
            // API provides batch add invalid cookies endpoint
            const response = await fetch('/v1/invalid-cookies', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    invalidCookies,
                }),
            });
            
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('invalidCookieModalMessage').innerHTML = `
                    <div class="info">Invalid cookies modified successfully</div>
                `;
                setTimeout(() => {
                    closeInvalidCookieModal();
                    renderInvalidCookies(); // Re-render list
                }, 1500);
            } else {
                document.getElementById('invalidCookieModalMessage').innerHTML = `
                    <div class="error">Failed to modify invalid cookies: ${data.error}</div>
                `;
            }
        } else {
            // If all invalid cookies cleared
            document.getElementById('invalidCookieModalMessage').innerHTML = `
                <div class="info">All invalid cookies cleared</div>
            `;
            setTimeout(() => {
                closeInvalidCookieModal();
                renderInvalidCookies(); // Re-render list
            }, 1500);
        }
    } catch (error) {
        console.error('Modify invalid cookies failed:', error);
        document.getElementById('invalidCookieModalMessage').innerHTML = `
            <div class="error">Failed to modify invalid cookies: ${error.message}</div>
        `;
    }
} 