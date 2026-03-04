// Theme management system

// Apply theme before HTML parsing to prevent initial flash
(function() {
  // Try to read user theme preference from localStorage
  const savedTheme = localStorage.getItem('userThemePreference');
  
  // If saved theme preference exists, apply immediately
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    // Check system theme
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    // Check current time
    const currentHour = new Date().getHours();
    if (currentHour >= 19 || currentHour < 7) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }
  
  // Add class to prevent transition effects during page load
  document.documentElement.classList.add('no-transition');
})();

document.addEventListener('DOMContentLoaded', () => {
  // Create theme toggle button
  createThemeToggle();
  
  // Initialize theme
  initTheme();
  
  // Listen for system theme changes
  listenForSystemThemeChanges();
  
  // Remove class that blocks transition effects
  setTimeout(() => {
    document.documentElement.classList.remove('no-transition');
  }, 100);
});

// Create theme toggle button
function createThemeToggle() {
  const themeSwitch = document.createElement('div');
  themeSwitch.className = 'theme-switch';
  themeSwitch.setAttribute('title', 'Toggle light/dark theme');
  themeSwitch.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
  `;
  
  // Update to current theme icon
  const currentTheme = document.documentElement.getAttribute('data-theme');
  updateThemeIcon(currentTheme);
  
  // Add click event listener
  themeSwitch.addEventListener('click', toggleTheme);
  
  // Add to page
  document.body.appendChild(themeSwitch);
}

// Initialize theme
function initTheme() {
  // First check user's theme preference
  const savedTheme = localStorage.getItem('userThemePreference');
  if (savedTheme) {
    applyTheme(savedTheme);
    return;
  }
  
  // If no user preference, check system theme
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
    return;
  }
  
  // Check current time
  const currentHour = new Date().getHours();
  if (currentHour >= 19 || currentHour < 7) {
    applyTheme('dark');
    return;
  }
  
  // If no special case, use light theme
  applyTheme('light');
}

// Apply theme
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
  localStorage.setItem('userThemePreference', theme);
}

// Update theme icon
function updateThemeIcon(theme) {
  const themeIcon = document.querySelector('.theme-icon');
  
  if (!themeIcon) return;
  
  if (theme === 'dark') {
    // Use CSS class toggle animation instead of directly modifying innerHTML
    themeIcon.classList.add('dark-mode');
    themeIcon.innerHTML = `
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    `;
  } else {
    themeIcon.classList.remove('dark-mode');
    themeIcon.innerHTML = `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    `;
  }
}

// Toggle theme
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  // Add transition class, enable smooth animation
  document.documentElement.classList.add('theme-transition');
  
  // Apply new theme
  applyTheme(newTheme);
  
  // Toggle animation effect
  const themeSwitch = document.querySelector('.theme-switch');
  if (themeSwitch) {
    themeSwitch.classList.add('theme-switch-animate');
    setTimeout(() => {
      themeSwitch.classList.remove('theme-switch-animate');
    }, 700);
  }
}

// Listen for system theme changes
function listenForSystemThemeChanges() {
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      // Only follow system when user hasn't manually set theme
      if (!localStorage.getItem('userThemePreference')) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
}

// Time-based auto theme switching
function scheduleThemeChange() {
  // Only auto-switch when user hasn't manually set theme
  if (!localStorage.getItem('userThemePreference')) {
    const currentHour = new Date().getHours();
    if (currentHour >= 19 || currentHour < 7) {
      applyTheme('dark');
    } else {
      applyTheme('light');
    }
  }
  
  // Check every hour
  setTimeout(scheduleThemeChange, 3600000);
}

// Start time-based theme switching
scheduleThemeChange();

// Side navigation functionality
document.addEventListener('DOMContentLoaded', function() {
  initSideNavigation();
});

// Initialize side navigation
function initSideNavigation() {
  // Get all cards
  const cards = document.querySelectorAll('.card');
  const navContent = document.querySelector('.side-nav-content');
  const trigger = document.querySelector('.side-nav-trigger');
  const menu = document.querySelector('.side-nav-menu');
  
  if (!cards.length || !navContent) return;
  
  // Create navigation item for each card
  cards.forEach((card, index) => {
    // Try to get card title
    let title = '';
    const h2 = card.querySelector('h2');
    const h1 = card.querySelector('h1');
    
    if (h2) {
      title = h2.textContent.trim();
    } else if (h1) {
      title = h1.textContent.trim();
    } else {
      title = `Section ${index + 1}`;
    }
    
    // Create navigation item
    const navItem = document.createElement('div');
    navItem.className = 'nav-item';
    navItem.setAttribute('data-target', index);
    
    // Create navigation dot
    const dot = document.createElement('div');
    dot.className = 'nav-item-dot';
    
    // Create title
    const titleSpan = document.createElement('div');
    titleSpan.className = 'nav-item-title';
    titleSpan.textContent = title;
    
    navItem.appendChild(dot);
    navItem.appendChild(titleSpan);
    navContent.appendChild(navItem);
    
    // Click event: scroll to corresponding card
    navItem.addEventListener('click', (e) => {
      e.preventDefault();
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  
  // Use Intersection Observer to detect currently visible card
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const index = Array.from(cards).indexOf(entry.target);
        updateActiveNavItem(index);
      }
    });
  }, { threshold: 0.3 });
  
  // Observe all cards
  cards.forEach(card => {
    observer.observe(card);
  });
  
  // Update active navigation item
  function updateActiveNavItem(index) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.classList.remove('active');
    });
    
    const activeItem = document.querySelector(`.nav-item[data-target="${index}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
      
      // Ensure active item is in viewport
      if (activeItem.offsetTop < navContent.scrollTop || 
          activeItem.offsetTop > navContent.scrollTop + navContent.clientHeight) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
  
  // Mobile touch event handling
  if (trigger && menu) {
    trigger.addEventListener('touchstart', function(e) {
      e.preventDefault();
      this.classList.toggle('touch-active');
      menu.classList.toggle('touch-active');
    });
    
    // Click other area to close mobile navigation
    document.addEventListener('touchstart', function(e) {
      if (!e.target.closest('.side-nav-trigger') && !e.target.closest('.side-nav-menu')) {
        trigger.classList.remove('touch-active');
        menu.classList.remove('touch-active');
      }
    });
  }
}
