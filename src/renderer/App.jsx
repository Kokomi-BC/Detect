import React, { useState, useEffect, useRef } from 'react';
import './style.css';
import { setColorScheme, setTheme } from 'mdui';
import contentHelpers from './contentHelpers';
const { getLeftInputContent, getUrlExtractedContent } = contentHelpers;

const MAX_IMAGES = 3;

function App() {
  // 深色模式状态
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 初始化主题和配色方案
  useEffect(() => {
    // 检查系统深色模式偏好
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('app-theme');
    const initialDarkMode = savedTheme ? savedTheme === 'dark' : prefersDark;
    
    setIsDarkMode(initialDarkMode);
    applyTheme(initialDarkMode);
    
    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (e) => {
      if (!localStorage.getItem('app-theme')) {
        setIsDarkMode(e.matches);
        applyTheme(e.matches);
      }
    };
    
    mediaQuery.addEventListener('change', handleThemeChange);
    return () => mediaQuery.removeEventListener('change', handleThemeChange);
  }, []);

  // 窗口最大化状态（用于自定义无框窗口控制）
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    const handleMax = () => setIsWindowMaximized(true);
    const handleUnmax = () => setIsWindowMaximized(false);
    window.electronAPI.on('window-maximized', handleMax);
    window.electronAPI.on('window-unmaximized', handleUnmax);

    // 查询当前状态
    window.electronAPI.invoke('window-is-maximized').then((res) => {
      setIsWindowMaximized(!!res);
    }).catch(() => {});

    return () => {
      window.electronAPI.removeListener('window-maximized', handleMax);
      window.electronAPI.removeListener('window-unmaximized', handleUnmax);
    };
  }, []);

  // 应用主题
  const applyTheme = (darkMode) => {
    if (darkMode) {
      setTheme('dark');
      // 使用动态配色方案，基于深色调的莫兰迪色系
      setColorScheme('#8B4B4B'); // 深色模式下的主色调
      document.body.classList.add('dark');
    } else {
      setTheme('light');
      // 使用动态配色方案，基于浅色调的莫兰迪色系
      setColorScheme('#D1A7A7'); // 浅色模式下的主色调
      document.body.classList.remove('dark');
    }
  };

  // 切换深色模式
  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem('app-theme', newDarkMode ? 'dark' : 'light');
    applyTheme(newDarkMode);
    
    // 同时切换Electron原生框架的深色模式
    window.electronAPI.invoke('set-theme', newDarkMode);
  };
  // 状态管理
  const [inputText, setInputText] = useState('');
  const [detectedResult, setDetectedResult] = useState([]);
  const [extractedContent, setExtractedContent] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  // 清理菜单状态
  const [showClearMenu, setShowClearMenu] = useState(false);
  // 菜单引用
  const clearMenuRef = useRef(null);
  // 图片相关状态
  const [images, setImages] = useState([]); // {id, src}
  const [isDragging, setIsDragging] = useState(false);

// 分隔线位置状态
const [dividerPosition, setDividerPosition] = useState(50);

// Toast提示状态
const [showToast, setShowToast] = useState(false);
const [toastMessage, setToastMessage] = useState('');
const [toastType, setToastType] = useState('success');

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (clearMenuRef.current && !clearMenuRef.current.contains(event.target)) {
        setShowClearMenu(false);
      }
    };

    if (showClearMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showClearMenu]);

  // 绑定粘贴事件，支持粘贴图片到应用
  useEffect(() => {
    const handlePaste = (e) => {
      try {
        const items = (e.clipboardData || window.clipboardData)?.items;
        if (!items) return;

        const imageItems = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type && item.type.indexOf('image') !== -1) {
            imageItems.push(item.getAsFile());
          }
        }

        if (imageItems.length) {
          // 阻止默认粘贴行为（以免粘贴图片被插入文本框）
          e.preventDefault();
          imageItems.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              addImageSrc(ev.target.result);
            };
            reader.readAsDataURL(file);
          });
        }
      } catch (err) {
        console.warn('paste handler error', err);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [images]);

  // URL检测函数
  const isURL = (text) => {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  };

  // 将路径/数据URL添加到 images（限制数量）
  const addImageSrc = (src) => {
    setImages((prev) => {
      if (prev.length >= MAX_IMAGES) {
        setToastMessage(`最多只能选择 ${MAX_IMAGES} 张图片`);
        setToastType('error');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
        return prev;
      }
      const next = [...prev, { id: Date.now() + Math.random(), src }];
      return next;
    });
  };

  const openImagePicker = async () => {
    try {
      const paths = await window.electronAPI.invoke('open-image-dialog');
      if (!paths || !paths.length) return;

      // 将文件路径转为 file:// URL（修正反斜杠）
      const normalized = paths.map((p) => {
        if (p.startsWith('data:')) return p;
        // Windows 路径需要替换反斜杠
        const fp = p.replace(/\\/g, '/');
        return `file:///${fp}`;
      });

      // 添加，遵循限制
      for (let i = 0; i < normalized.length; i++) {
        addImageSrc(normalized[i]);
      }
    } catch (err) {
      console.error('openImagePicker error', err);
    }
  };

  // 处理拖放的文件或数据
  const handleDropFiles = (filesList) => {
    const files = Array.from(filesList || []);
    files.forEach((file) => {
      // Electron 提供 file.path；在普通浏览器环境为 File 对象
      if (file.path) {
        const fp = file.path.replace(/\\/g, '/');
        addImageSrc(`file:///${fp}`);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => addImageSrc(e.target.result);
        reader.readAsDataURL(file);
      }
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      handleDropFiles(e.dataTransfer.files);
    }
  };

  const removeImage = (id) => {
    setImages((prev) => prev.filter((it) => it.id !== id));
  };

  // 内容提取函数
  const extractContent = (url) => {
    setExtracting(true);
    setExtractionError(null);
    setExtractedContent(null);
    setIsCancelling(false);
    window.electronAPI.send('extract-content', url);
  };

  // 终止提取函数
  const cancelExtraction = () => {
    setIsCancelling(true);
    window.electronAPI.send('cancel-extraction');
  };

  // 监听主进程的内容提取结果
  useEffect(() => {
    const handleExtractResult = (event, result) => {
      setExtracting(false);
      setIsCancelling(false);
      if (result.success) {
        // 成功提取URL内容时，清除之前的文本检测结果
        setDetectedResult([]);
        setExtractedContent(result);
      } else {
    
        setDetectedResult([]);
        setExtractionError(result.error);
      }
    };

    const handleExtractionCancelled = () => {
      setExtracting(false);
      setIsCancelling(false);
      setExtractionError('提取已取消');
    };

    const handleClearResults = () => {
      // 清除结果功能：清空所有显示的内容
      setDetectedResult([]);
      setExtractedContent(null);
      setExtractionError(null);
      setExtracting(false);
      setIsCancelling(false);
      console.log('右侧界面内容已清除');
      setToastMessage('结果已清除！');
      setToastType('success');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    };

    window.electronAPI.on('extract-content-result', handleExtractResult);
    window.electronAPI.on('extraction-cancelled', handleExtractionCancelled);
    window.electronAPI.on('clear-results', handleClearResults);

    return () => {
      window.electronAPI.removeListener('extract-content-result', handleExtractResult);
      window.electronAPI.removeListener('extraction-cancelled', handleExtractionCancelled);
      window.electronAPI.removeListener('clear-results', handleClearResults);
    };
  }, []);

  // 模拟检测假新闻的处理函数
  const handleDetect = () => {
    if (!inputText.trim()) {
      setToastMessage('请输入要检测的文本内容！');
      setToastType('error');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    // 检查输入是否为URL
    if (isURL(inputText)) {
      // URL输入时，清除文本检测结果，专注于URL内容提取
      setDetectedResult([]);
      extractContent(inputText);
      return;
    }

    // 非URL文本输入时，清除URL提取相关内容
    setExtractedContent(null);
    setExtractionError(null);
    setExtracting(false);
    
    // 模拟检测结果：将每3句话标记为可疑
    const sentences = inputText.split(/(?<=[。.!?])\s*/);
    const labelsList = ['可疑事实', '来源存疑', '逻辑矛盾', '夸大其词', '图片不符'];
    
    const result = sentences.map((sentence, index) => {
      const isSuspicious = index % 3 === 0;
      const labels = isSuspicious 
        ? [labelsList[Math.floor(Math.random() * labelsList.length)]] 
        : [];
      
      return {
        text: sentence,
        isSuspicious,
        labels,
      };
    });

    setDetectedResult(result);
    
    // 显示成功提示
    setToastMessage('文本检测完成！');
    setToastType('success');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };







  const handleClearBrowserData = () => {
    window.electronAPI.invoke('clear-browser-data')
      .then((result) => {
        if (result.success) {
          setToastMessage('浏览器数据清理成功！');
          setToastType('success');
        } else {
          setToastMessage('浏览器数据清理失败！');
          setToastType('error');
        }
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
        setShowClearMenu(false);
      })
      .catch((error) => {
        setToastMessage('浏览器数据清理失败！');
        setToastType('error');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
        setShowClearMenu(false);
      });
  };

  // 分隔线拖动处理
  const handleDividerMouseDown = (e) => {
    e.preventDefault();
    document.addEventListener('mousemove', handleDividerMouseMove);
    document.addEventListener('mouseup', handleDividerMouseUp);
  };

  const handleDividerMouseMove = (e) => {
    const container = document.querySelector('.app-container');
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const newPosition = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      const clampedPosition = Math.max(20, Math.min(80, newPosition)); // 限制在20%-80%之间
      setDividerPosition(clampedPosition);
    }
  };

  const handleDividerMouseUp = () => {
    document.removeEventListener('mousemove', handleDividerMouseMove);
    document.removeEventListener('mouseup', handleDividerMouseUp);
  };

  return (
    <div className="app-container">
      {/* 自定义无框标题栏（跨全宽） */}
      <div className="native-titlebar titlebar" style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--mdui-color-primary)', boxShadow: 'var(--mdui-shadow-level1)' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>假新闻检测应用</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="no-drag">
          <button className="window-btn" title="最小化" onClick={() => window.electronAPI.send('window-minimize')} style={{ WebkitAppRegion: 'no-drag' }}>
            —
          </button>
          <button className="window-btn" title={isWindowMaximized ? '还原' : '最大化'} onClick={() => window.electronAPI.send('window-maximize')} style={{ WebkitAppRegion: 'no-drag' }}>
            {isWindowMaximized ? '❐' : '▢'}
          </button>
          <button className="window-btn" title="关闭" onClick={() => window.electronAPI.send('window-close')} style={{ WebkitAppRegion: 'no-drag' }}>
            ✕
          </button>
        </div>
      </div>
      {/* 左侧输入区域 */}
        <div 
        className={`input-area${isDragging ? ' drag-over' : ''}`} 
        style={{ 
          width: `${dividerPosition}%`,
          height: 'calc(100vh - 36px)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
          boxSizing: 'border-box'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text)' }}>
            新闻原文输入
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* 添加图片按钮 */}
            <button
              className="control-btn no-drag"
              onClick={openImagePicker}
              title={`添加图片（最多 ${MAX_IMAGES} 张）`}
              style={{ fontSize: '18px' }}
            >
              +
            </button>
            {/* 深色模式切换按钮 */}
            <button
              className="control-btn no-drag"
              onClick={toggleDarkMode}
              title={isDarkMode ? '切换到浅色模式' : '切换到深色模式'}
            >
              {isDarkMode ? '🌙' : '☀️'}
            </button>
            <div 
              ref={clearMenuRef}
              style={{ position: 'relative', display: 'inline-block' }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowClearMenu(!showClearMenu);
                }}
                className="control-btn no-drag"
                style={{ fontSize: '24px' }}
                title="更多选项"
              >
              ⋮
            </button>
            {/* 下拉菜单 */}
            {showClearMenu && (
              <div
                className="dropdown-menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  backgroundColor: 'var(--mdui-color-surface)',
                  border: '1px solid var(--mdui-color-outline)',
                  borderRadius: '16px',
                  boxShadow: 'var(--mdui-shadow-level2)',
                  zIndex: 10000,
                  minWidth: '180px',
                  animation: 'menuSlideIn 0.2s ease-out',
                  overflow: 'hidden'
                }}
              >
                <button
                  onClick={() => {
                    handleClearBrowserData();
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: 'var(--mdui-color-on-surface)',
                    backgroundColor: 'var(--mdui-color-surface)',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--mdui-color-primary-container)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--mdui-color-surface)'}
                >
                  清理浏览器数据
                </button>
              </div>
            )}
            </div>
          </div>
        </div>
        <mdui-text-field
          value={inputText}
          onChange={(e) => setInputText(e.currentTarget.value)}
          placeholder="请输入或粘贴待检测的新闻文本..."
          style={{ 
            width: '100%',
            flex: images.length ? '0 1 60%' : 1,
            marginBottom: '12px',
            minHeight: '0',
            fontSize: '14px',
            lineHeight: '1.5'
          }}
          rows="25"
          multiline
        ></mdui-text-field>

        {/* 图片预览 */}
        {images && images.length > 0 && (
          <div className="image-list">
            {images.map((it) => (
              <div className="image-item" key={it.id}>
                <img src={it.src} alt="preview" />
                <div className="remove-btn" onClick={() => removeImage(it.id)}>✕</div>
              </div>
            ))}
          </div>
        )}
        <mdui-button
          onClick={handleDetect}
          className="start-detect-btn"
          style={{ 
            width: '100%',
            flexShrink: 0
          }}
          variant="filled"
          fullwidth
        >
          开始检测
        </mdui-button>
      </div>

      {/* 可拖动分隔线 */}
      <div
        className="divider"
        onMouseDown={handleDividerMouseDown}
        style={{
          width: '4px',
          background: '#e8e8e8',
          cursor: 'col-resize',
          userSelect: 'none',
          alignSelf: 'stretch'
        }}
      />

      {/* 右侧输出区域 */}
      <div 
        className="output-area" 
        style={{ 
          width: `${100 - dividerPosition}%`,
          height: 'calc(100vh - 36px)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text)' }}>
            检测结果输出
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {extracting && (
              <mdui-button
                onClick={cancelExtraction}
                disabled={isCancelling}
                variant="outlined"
              >
                {isCancelling ? '正在终止...' : '终止'}
              </mdui-button>
            )}
          </div>
        </div>
        <div 
          style={{ 
            fontSize: '14px', 
            lineHeight: '1.6', 
            color: 'var(--color-text)',
            padding: extracting ? '0' : '8px',
            boxSizing: 'border-box',
            textAlign: 'left',
            flex: 1,
            overflowY: 'auto',
            minHeight: 0,
            userSelect: (!extracting && !extractedContent && !detectedResult.length) ? 'none' : 'auto',
            display: extracting ? 'flex' : 'block'
          }}
          onMouseDown={(e) => {
            if (!extracting && !extractedContent && !detectedResult.length) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            }
          }}
          onMouseUp={(e) => {
            if (!extracting && !extractedContent && !detectedResult.length) {
              e.preventDefault();
              e.stopPropagation();
              window.getSelection()?.removeAllRanges();
              return false;
            }
          }}
        >
          {/* 显示URL提取的内容 */}
          {extracting && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: '20px'
            }}>
              <div className="spinner" role="status" aria-label="加载中">
                <svg className="spinner-ring" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <circle className="path" cx="25" cy="25" r="20"></circle>
                </svg>
              </div>
              <p style={{ 
                margin: 0, 
                fontSize: '16px', 
                color: 'var(--mdui-color-on-surface-variant)',
                opacity: 0.8
              }}>正在提取内容...</p>
            </div>
          )}
          {extractionError && <p style={{ color: 'red' }}>{extractionError}</p>}
          {extractedContent && (
            <div>
              <h3 className="mdui-typography-title" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>{extractedContent.title}</h3>
              <div style={{ marginBottom: '24px' }}>{extractedContent.content}</div>
              {extractedContent.images.length > 0 && (
                <div>
                  <h4 className="mdui-typography-subheading" style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>相关图片</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {extractedContent.images.map((image, index) => (
                      <div key={index} style={{ width: '150px', height: '150px', overflow: 'hidden', borderRadius: '4px' }}>
                        <img 
                          src={image} 
                          alt={`图片 ${index + 1}`} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 显示文本检测结果 */}
          {!extracting && !extractedContent && detectedResult.length > 0 && detectedResult.map((part, index) => (
              <div key={index} style={{ marginBottom: '12px' }}>
                {/* 高亮显示的文本内容 */}
                <span className={part.isSuspicious ? 'highlight-text' : ''}>
                  {part.text}
                </span>

                {/* 可疑标签 */}
                {part.isSuspicious && part.labels.length > 0 && (
                  <div style={{ display: 'inline-block', marginLeft: '8px' }}>
                    {part.labels.map((label, labelIndex) => (
                      <span key={labelIndex} className="suspicious-label">
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

          {/* 当左侧输入为空时，右侧显示提示信息 */}
          {!extracting && !extractedContent && !detectedResult.length && <p>请在左侧输入新闻文本或URL并点击检测按钮</p>}
        </div>
      </div>

      {/* Toast提示 */}
      {showToast && (
        <mdui-snackbar
          open={showToast}
          onClose={() => setShowToast(false)}
          style={{
            '--md-snackbar-container-color': toastType === 'success' ? '#52c41a' : '#f5222d'
          }}
        >
          {toastMessage}
        </mdui-snackbar>
      )}


    </div>
  );
}

export default App;