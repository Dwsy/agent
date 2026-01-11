const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ACE Tool - Web UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            dark: {
              primary: '#0a0a0a',
              secondary: '#1a1a1a',
              tertiary: '#2a2a2a',
              border: '#333'
            }
          }
        }
      }
    }
  </script>
  <style type="text/tailwindcss">
    @layer base {
      body { @apply bg-white text-gray-900 dark:bg-dark-primary dark:text-gray-100 transition-colors duration-300; }
    }
    @layer components {
      .btn { @apply px-4 py-2 rounded-md transition-all duration-200 font-medium active:scale-95 disabled:opacity-50 disabled:pointer-events-none; }
      .btn-primary { @apply bg-blue-600 text-white hover:bg-blue-700; }
      .btn-secondary { @apply bg-gray-200 text-gray-800 dark:bg-dark-secondary dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-dark-tertiary border border-transparent dark:border-dark-border; }
      .input-field { @apply w-full bg-gray-50 dark:bg-dark-secondary border border-gray-300 dark:border-dark-border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all; }
      .card { @apply bg-gray-50 dark:bg-dark-secondary border border-gray-200 dark:border-dark-border rounded-lg p-4; }
      .tab-btn { @apply px-4 py-2 text-sm font-medium border-b-2 border-transparent transition-all; }
      .tab-btn.active { @apply border-blue-500 text-blue-600 dark:text-blue-400; }
    }
  </style>
</head>
<body class="min-h-screen p-4 md:p-8">
  <div class="max-w-4xl mx-auto space-y-6">
    <header class="flex justify-between items-start">
      <div>
        <h1 class="text-2xl font-bold" data-i18n="title">ACE Tool Debug UI</h1>
        <p class="text-gray-500 dark:text-gray-400 text-sm" data-i18n="subtitle">Semantic code search powered by AugmentCode</p>
      </div>
      <div class="flex gap-2">
        <div class="flex bg-gray-100 dark:bg-dark-secondary rounded-md p-1 border dark:border-dark-border">
          <button class="lang-btn px-3 py-1 text-xs rounded transition-all active" data-lang="en">EN</button>
          <button class="lang-btn px-3 py-1 text-xs rounded transition-all" data-lang="zh">中文</button>
        </div>
        <button id="themeBtn" class="btn-secondary p-2 rounded-md">🌙</button>
      </div>
    </header>

    <div class="grid md:grid-cols-3 gap-4">
      <div class="md:col-span-2 space-y-1">
        <label class="text-xs text-gray-500 dark:text-gray-400 font-semibold" data-i18n="project.title">PROJECT PATH</label>
        <input type="text" id="projectPath" class="input-field text-sm" placeholder="Enter project path (optional)" />
      </div>
      <div class="card flex flex-col justify-center">
        <div class="flex items-center gap-2 mb-2">
          <div id="statusDot" class="w-3 h-3 rounded-full bg-gray-400 shadow-[0_0_8px_rgba(156,163,175,0.5)]"></div>
          <span id="statusText" class="text-sm font-medium text-gray-600 dark:text-gray-400">Checking...</span>
        </div>
        <div id="statusDetails" class="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono opacity-70"></div>
      </div>
    </div>

    <div class="border-b dark:border-dark-border flex">
      <button class="tab-btn active" data-tab="search" data-i18n="tabs.search">Search</button>
      <button class="tab-btn" data-tab="enhance" data-i18n="tabs.enhance">Enhance Prompt</button>
    </div>

    <main>
      <section id="searchSection" class="tab-content space-y-4">
        <div class="space-y-2">
          <textarea id="searchQuery" class="input-field min-h-[120px] font-mono text-sm resize-y" data-i18n="search.placeholder" placeholder="Enter search query..."></textarea>
          <button id="searchBtn" class="btn btn-primary w-full md:w-auto" data-i18n="search.button">Search</button>
        </div>
        <div id="searchResults" class="space-y-4"></div>
        <div class="card bg-blue-50/30 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30">
          <h3 class="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider" data-i18n="search.examples">Quick Examples</h3>
          <div class="flex flex-wrap gap-2">
            <button class="example-btn text-xs text-blue-500 hover:underline" data-type="search" data-i18n="search.ex1">User Auth</button>
            <button class="example-btn text-xs text-blue-500 hover:underline" data-type="search" data-i18n="search.ex2">LoadAll Function</button>
            <button class="example-btn text-xs text-blue-500 hover:underline" data-type="search" data-i18n="search.ex3">DB Connection</button>
            <button class="example-btn text-xs text-blue-500 hover:underline" data-type="search" data-i18n="search.ex4">Session Management</button>
          </div>
        </div>
      </section>

      <section id="enhanceSection" class="tab-content hidden space-y-4">
        <div class="space-y-2">
          <textarea id="enhanceQuery" class="input-field min-h-[120px] font-mono text-sm resize-y" data-i18n="enhance.placeholder" placeholder="Enter prompt to enhance..."></textarea>
          <button id="enhanceBtn" class="btn btn-primary w-full md:w-auto" data-i18n="enhance.button">Enhance</button>
        </div>
        <div id="enhanceResults" class="space-y-4"></div>
        <div class="card bg-purple-50/30 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900/30">
          <h3 class="text-xs font-bold text-purple-600 dark:text-purple-400 mb-2 uppercase tracking-wider" data-i18n="enhance.examples">Quick Examples</h3>
          <div class="flex flex-wrap gap-2">
            <button class="example-btn text-xs text-purple-500 hover:underline" data-type="enhance" data-i18n="enhance.ex1">Add Login</button>
            <button class="example-btn text-xs text-purple-500 hover:underline" data-type="enhance" data-i18n="enhance.ex2">Create Component</button>
            <button class="example-btn text-xs text-purple-500 hover:underline" data-type="enhance" data-i18n="enhance.ex3">Error Handling</button>
          </div>
        </div>
      </section>
    </main>
  </div>

  <script>
    const translations = {
      en: {
        title: 'ACE Tool Web UI',
        subtitle: 'Semantic code search powered by AugmentCode',
        status: { online: 'Online', offline: 'Offline', checking: 'Checking...' },
        tabs: { search: 'Search', enhance: 'Enhance' },
        search: { placeholder: 'Where is auth handled?', button: 'Search', searching: 'Searching...', noResults: 'No results found', examples: 'Quick Examples' },
        enhance: { placeholder: 'Add a login page', button: 'Enhance', enhancing: 'Enhancing...', noResult: 'Failed to enhance', original: 'Original', enhanced: 'Enhanced' },
        project: { title: 'PROJECT PATH' }
      },
      zh: {
        title: 'ACE Tool 语义搜索',
        subtitle: '基于 AugmentCode 的代码上下文检索',
        status: { online: '在线', offline: '离线', checking: '检查中...' },
        tabs: { search: '语义搜索', enhance: '提示词增强' },
        search: { placeholder: '用户认证在哪里处理？', button: '搜索', searching: '搜索中...', noResults: '未找到结果', examples: '快速示例' },
        enhance: { placeholder: '添加登录页面', button: '增强', enhancing: '增强中...', noResult: '增强失败', original: '原始需求', enhanced: '增强后' },
        project: { title: '项目路径' }
      }
    };

    const state = {
      lang: 'en',
      theme: 'dark',
      projectPath: localStorage.getItem('ace_project_path') || '',
      lastEnhancedResult: ''
    };

    function t(key) {
      return key.split('.').reduce(function(obj, i) { return obj && obj[i]; }, translations[state.lang]) || key;
    }

    function updateUI() {
      $('[data-i18n]').each(function() {
        const key = $(this).data('i18n');
        if (this.tagName === 'TEXTAREA' || this.tagName === 'INPUT') {
          $(this).attr('placeholder', t(key));
        } else {
          $(this).text(t(key));
        }
      });
      
      $('.lang-btn').removeClass('bg-blue-600 text-white active hover:text-white').addClass('text-gray-500 dark:text-gray-400 hover:text-blue-500');
      $('.lang-btn[data-lang="' + state.lang + '"]').addClass('bg-blue-600 text-white active hover:text-white').removeClass('text-gray-500 dark:text-gray-400');
    }

    async function checkHealth() {
      try {
        const res = await fetch('/health');
        const data = await res.json();
        const isOnline = data.status === 'running' || data.status === 'online';
        
        $('#statusDot').attr('class', 'w-3 h-3 rounded-full ' + (isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'));
        $('#statusText').text(isOnline ? t('status.online') : t('status.offline'));
        
        if (isOnline) {
          $('#statusDetails').html(
            '<span>UPTIME</span><span>' + Math.floor(data.uptime) + 's</span>' +
            '<span>REM</span><span>' + data.remainingMinutes + 'm</span>'
          );
        }
      } catch (e) {
        $('#statusDot').attr('class', 'w-3 h-3 rounded-full bg-red-500');
        $('#statusText').text(t('status.offline'));
      }
    }

    $('.lang-btn').click(function() {
      state.lang = $(this).data('lang');
      updateUI();
    });

    $('#themeBtn').click(function() {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      $('html').toggleClass('dark', state.theme === 'dark');
      $(this).text(state.theme === 'dark' ? '🌙' : '☀️');
    });

    $('.tab-btn').click(function() {
      $('.tab-btn').removeClass('active');
      $(this).addClass('active');
      $('.tab-content').addClass('hidden');
      $('#' + $(this).data('tab') + 'Section').removeClass('hidden');
    });

    $('#projectPath').val(state.projectPath).on('input', function() {
      state.projectPath = $(this).val();
      localStorage.setItem('ace_project_path', state.projectPath);
    });

    $('#searchBtn').click(async function() {
      const query = $('#searchQuery').val().trim();
      if (!query) return;
      const btn = $(this);
      btn.prop('disabled', true).text(t('search.searching'));
      $('#searchResults').html('<div class="text-center py-8 animate-pulse text-gray-400">Searching codebase...</div>');
      try {
        const res = await fetch('/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'tools/call',
            params: { name: 'search_context', arguments: { query: query, project_root_path: state.projectPath } }
          })
        });
        const data = await res.json();
        
        // Handle MCP response format: { result: { content: [{ type: 'text', text: '...' }] } }
        let html = '';
        if (data.result && data.result.content && Array.isArray(data.result.content)) {
          data.result.content.forEach(function(item) {
            if (item.type === 'text') {
              html += '<div class="card bg-gray-50 dark:bg-dark-secondary border-l-4 border-blue-500">' +
                '<pre class="text-[11px] font-mono whitespace-pre-wrap overflow-x-auto">' + 
                  $('<div/>').text(item.text).html() + 
                '</pre>' +
              '</div>';
            }
          });
        } 
        // Fallback for previous results format
        else if (data.result && data.result.results && Array.isArray(data.result.results)) {
          data.result.results.forEach(function(r) {
            html += '<div class="card hover:border-blue-500 transition-colors group">' +
              '<div class="flex justify-between items-start mb-2">' +
                '<span class="text-xs font-mono text-blue-500 truncate mr-4">' + r.file + '</span>' +
                '<span class="text-[10px] text-gray-400">' + (r.score ? Number(r.score).toFixed(3) : '') + '</span>' +
              '</div>' +
              '<pre class="text-[11px] font-mono bg-gray-100 dark:bg-dark-primary p-2 rounded overflow-x-auto">' + 
                $('<div/>').text(r.content || '').html() + 
              '</pre>' +
            '</div>';
          });
        }

        if (!html) {
          $('#searchResults').html('<div class="card text-center text-gray-500">' + t('search.noResults') + '</div>');
        } else {
          $('#searchResults').html(html);
        }
      } catch (e) {
        $('#searchResults').html('<div class="card border-red-500 text-red-500">' + e.message + '</div>');
      }
      btn.prop('disabled', false).text(t('search.button'));
    });

    window.copyToClipboard = function() {
      if (!state.lastEnhancedResult) return;
      navigator.clipboard.writeText(state.lastEnhancedResult);
      const btn = $('#copyBtn');
      const originalText = btn.text();
      btn.text('Copied!');
      setTimeout(function() { btn.text(originalText); }, 2000);
    };

    $('#enhanceBtn').click(async function() {
      const promptText = $('#enhanceQuery').val().trim();
      if (!promptText) return;
      const btn = $(this);
      btn.prop('disabled', true).text(t('enhance.enhancing'));
      $('#enhanceResults').html('<div class="text-center py-8 animate-pulse text-gray-400">Enhancing prompt...</div>');
      try {
        const res = await fetch('/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'tools/call',
            params: { 
              name: 'enhance_prompt', 
              arguments: { 
                prompt: promptText, 
                project_root_path: state.projectPath,
                conversation_history: JSON.stringify([{ role: 'user', content: promptText }])
              } 
            }
          })
        });
        const data = await res.json();
        
        let enhanced = '';
        if (data.result && data.result.content && Array.isArray(data.result.content)) {
          data.result.content.forEach(function(item) {
            if (item.type === 'text') enhanced += item.text;
          });
        } else if (data.result && data.result.enhanced) {
          enhanced = data.result.enhanced;
        }

        if (!enhanced) {
          $('#enhanceResults').html('<div class="card text-center text-gray-500">' + t('enhance.noResult') + '</div>');
        } else {
          state.lastEnhancedResult = enhanced;
          let html = '<div class="space-y-4">' +
              '<div class="space-y-1">' +
                '<label class="text-[10px] text-gray-400 font-bold uppercase">' + t('enhance.original') + '</label>' +
                '<div class="p-3 bg-gray-100 dark:bg-dark-secondary rounded text-xs opacity-60 font-mono">' + $('<div/>').text(promptText).html() + '</div>' +
              '</div>' +
              '<div class="space-y-1">' +
                '<label class="text-[10px] text-blue-500 font-bold uppercase flex justify-between">' +
                  '<span>' + t('enhance.enhanced') + '</span>' +
                  '<button id="copyBtn" class="hover:text-white" onclick="copyToClipboard()">Copy</button>' +
                '</label>' +
                '<div class="p-4 bg-blue-50 dark:bg-dark-secondary border border-blue-200 dark:border-blue-900/50 rounded text-sm font-mono whitespace-pre-wrap">' + $('<div/>').text(enhanced).html() + '</div>' +
              '</div>' +
            '</div>';
          $('#enhanceResults').html(html);
        }
      } catch (e) {
        $('#enhanceResults').html('<div class="card border-red-500 text-red-500">' + e.message + '</div>');
      }
      btn.prop('disabled', false).text(t('enhance.button'));
    });

    $(document).on('click', '.example-btn', function() {
      const type = $(this).data('type');
      const val = $(this).text();
      const targetSelector = type === 'search' ? '#searchQuery' : '#enhanceQuery';
      const placeholderText = $(targetSelector).attr('placeholder');
      const prefixText = placeholderText.split('\\n')[0].replace('示例：', '').replace('Examples:', '').trim();
      $(targetSelector).val(prefixText + ' ' + val);
    });

    updateUI();
    checkHealth();
    setInterval(checkHealth, 5000);
  </script>
</body>
</html>
`;
export default HTML_TEMPLATE;
