import React, { useState, useEffect, useRef } from 'react';
import './style.css';
import { setColorScheme, setTheme } from 'mdui';
const { ipcRenderer } = require('electron');

function App() {
  // 初始化主题和配色方案
  useEffect(() => {
    // 设置淡粉色莫兰迪配色方案 (#F5E6E6)
    setColorScheme('#F5E6E6');
    
    // 检测系统深色模式并设置
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    const setSystemTheme = (e) => {
      setTheme(e.matches ? 'dark' : 'light');
    };
    
    // 初始设置
    setTheme(prefersDark.matches ? 'dark' : 'light');
    
    // 监听系统主题变化
    prefersDark.addEventListener('change', setSystemTheme);
    
    return () => {
      prefersDark.removeEventListener('change', setSystemTheme);
    };
  }, []);
  // 状态管理
  const [inputText, setInputText] = useState('');
  const [detectedResult, setDetectedResult] = useState([]);
  const [extractedContent, setExtractedContent] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  // 右键菜单状态
  const [showMenu, setShowMenu] = useState(false);
  const [menuX, setMenuX] = useState(0);
  const [menuY, setMenuY] = useState(0);
  const [selectedText, setSelectedText] = useState('');
  const [targetElement, setTargetElement] = useState(null);
  // 清理菜单状态 - 重新添加
  const [showClearMenu, setShowClearMenu] = useState(false);
  // 菜单引用
const menuRef = useRef(null);
const clearMenuRef = useRef(null);

// 分隔线位置状态
const [dividerPosition, setDividerPosition] = useState(50);

// Toast提示状态
const [showToast, setShowToast] = useState(false);
const [toastMessage, setToastMessage] = useState('');
const [toastType, setToastType] = useState('success');

  // URL检测函数
  const isURL = (text) => {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  };

  // 内容提取函数
  const extractContent = (url) => {
    setExtracting(true);
    setExtractionError(null);
    setExtractedContent(null);
    setIsCancelling(false);
    ipcRenderer.send('extract-content', url);
  };

  // 终止提取函数
  const cancelExtraction = () => {
    setIsCancelling(true);
    ipcRenderer.send('cancel-extraction');
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
        // 提取失败时，清除之前的文本检测结果
        setDetectedResult([]);
        setExtractionError(result.error);
      }
    };

    const handleExtractionCancelled = () => {
      setExtracting(false);
      setIsCancelling(false);
      setExtractionError('提取已取消');
    };

    ipcRenderer.on('extract-content-result', handleExtractResult);
    ipcRenderer.on('extraction-cancelled', handleExtractionCancelled);

    return () => {
      ipcRenderer.removeListener('extract-content-result', handleExtractResult);
      ipcRenderer.removeListener('extraction-cancelled', handleExtractionCancelled);
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



  // 点击页面其他区域关闭右键菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
      if (clearMenuRef.current && !clearMenuRef.current.contains(event.target)) {
        setShowClearMenu(false);
      }
    };

    if (showMenu || showClearMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu, showClearMenu]);

  // 右键菜单处理
  const handleContextMenu = (e, element) => {
    e.preventDefault();
    const selection = window.getSelection();
    const text = selection.toString();
    
    // 当在提示信息区域且没有焦点元素时，完全禁用菜单
    if (!extracting && !extractedContent && !detectedResult.length && !element) {
      return;
    }
    
    // 当有选中文字或点击的是输入框时，显示菜单
    if (text || element) {
      setSelectedText(text);
      setTargetElement(element);
      setMenuX(e.clientX);
      setMenuY(e.clientY);
      setShowMenu(true);
    }
  };

  // 菜单事件处理
  const handleCopy = () => {
    navigator.clipboard.writeText(selectedText).then(() => {
      setShowMenu(false);
    }).catch(err => {
      console.error('复制失败:', err);
    });
  };

  const handleCut = () => {
    if (!targetElement) return;
    navigator.clipboard.writeText(selectedText).then(() => {
      const value = targetElement.value;
      const start = targetElement.selectionStart;
      const end = targetElement.selectionEnd;
      const newText = value.slice(0, start) + value.slice(end);
      setInputText(newText);
      setShowMenu(false);
    }).catch(err => {
      console.error('剪切失败:', err);
    });
  };

  const handlePaste = () => {
    if (!targetElement) return;
    navigator.clipboard.readText().then(pastedText => {
      const value = targetElement.value;
      const start = targetElement.selectionStart;
      const end = targetElement.selectionEnd;
      const newText = value.slice(0, start) + pastedText + value.slice(end);
      setInputText(newText);
      setShowMenu(false);
    }).catch(err => {
      console.error('粘贴失败:', err);
    });
  };

  const handleSearch = () => {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(selectedText)}`;
    ipcRenderer.send('open-url-in-window', searchUrl);
    setShowMenu(false);
  };

  const handleOpenLink = () => {
    if (isURL(selectedText)) {
      ipcRenderer.send('open-url-in-window', selectedText);
      setShowMenu(false);
    }
  };

  const handleClearBrowserData = () => {
    ipcRenderer.invoke('clear-browser-data')
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
      {/* 左侧输入区域 */}
      <div 
        className="input-area" 
        style={{ 
          width: `${dividerPosition}%`,
          height: '100vh',
          padding: '20px',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative' }}>
          <h2 className="mdui-typography-headline" style={{ fontSize: '18px', fontWeight: 600, color: '#262626', margin: 0 }}>
            新闻原文输入
          </h2>
          <div 
            ref={clearMenuRef}
            style={{ position: 'relative', display: 'inline-block' }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowClearMenu(!showClearMenu);
              }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#999',
                padding: '0',
                lineHeight: '1',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.color = '#666'}
              onMouseLeave={(e) => e.target.style.color = '#999'}
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
                  backgroundColor: 'white',
                  border: '1px solid #E6C0C0',
                  borderRadius: '4px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  zIndex: 10000,
                  minWidth: '180px',
                  animation: 'menuSlideIn 0.2s ease-out'
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
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#262626',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#F5E6E6'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  清理浏览器数据
                </button>
              </div>
            )}
          </div>
        </div>
        <mdui-text-field
          value={inputText}
          onChange={(e) => setInputText(e.currentTarget.value)}
          placeholder="请输入或粘贴待检测的新闻文本..."
          onContextMenu={(e) => {
            const target = e.currentTarget;
            target.focus();
            setTimeout(() => handleContextMenu(e, target), 0);
          }}
          style={{ 
            width: '100%',
            marginBottom: '12px',
            '--md-text-field-container-height': '200px'
          }}
          rows="8"
          multiline
        ></mdui-text-field>
        <mdui-button
          onClick={handleDetect}
          style={{ width: '100%' }}
          variant="raised"
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
          height: '100vh',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="mdui-typography-headline" style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#262626' }}>
            检测结果输出
          </h2>
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
        <div 
          style={{ 
            fontSize: '14px', 
            lineHeight: '1.6', 
            color: '#262626',
            padding: extracting ? '0' : '8px',
            boxSizing: 'border-box',
            textAlign: 'left',
            userSelect: (!extracting && !extractedContent && !detectedResult.length) ? 'none' : 'auto',
            height: '100%',
            display: extracting ? 'flex' : 'block'
          }}
          onContextMenu={(e) => handleContextMenu(e, null)}
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
          onSelectStart={(e) => {
            if (!extracting && !extractedContent && !detectedResult.length) {
              e.preventDefault();
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
              <mdui-circular-progress indeterminate></mdui-circular-progress>
              <p style={{ margin: 0, fontSize: '16px', color: '#666' }}>正在提取内容...</p>
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

      {/* 右键菜单 */}
      {showMenu && (
        <mdui-menu
          ref={menuRef}
          open={showMenu}
          onClose={() => setShowMenu(false)}
          style={{
            position: 'fixed',
            top: `${menuY}px`,
            left: `${menuX}px`,
            zIndex: 9999
          }}
        >
          {/* 只有当有选中文字时显示复制 */}
          {selectedText && (
            <mdui-menu-item onClick={handleCopy}>
              复制
            </mdui-menu-item>
          )}
          {/* 只有当有选中文字且点击的是输入框时显示剪切 */}
          {selectedText && targetElement && (
            <mdui-menu-item onClick={handleCut}>
              剪切
            </mdui-menu-item>
          )}
          {/* 点击的是输入框时显示粘贴 */}
          {targetElement && (
            <mdui-menu-item onClick={handlePaste}>
              粘贴
            </mdui-menu-item>
          )}
          {/* 只有当有选中文字时显示搜索，且显示搜索内容 */}
          {selectedText && (
            <mdui-menu-item onClick={handleSearch}>
              搜索 {selectedText}
            </mdui-menu-item>
          )}
          {/* 只有当选中的文字是URL时显示转到链接 */}
          {selectedText && isURL(selectedText) && (
            <mdui-menu-item onClick={handleOpenLink}>
              转到 {selectedText}
            </mdui-menu-item>
          )}
        </mdui-menu>
      )}
    </div>
  );
}

export default App;