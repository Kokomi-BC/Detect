import React, { useState, useEffect, useRef } from 'react';
import './style.css';
import { setColorScheme } from 'mdui';
const { ipcRenderer } = require('electron');

function App() {
  // 设置淡粉色莫冉迪配色方案
  useEffect(() => {
    setColorScheme('#F5E6E6');
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
  // 清理菜单状态
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
        setExtractedContent(result);
      } else {
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
    if (!inputText.trim()) return;

    // 检查输入是否为URL
    if (isURL(inputText)) {
      extractContent(inputText);
      return;
    }

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
  };



  // 点击页面其他区域关闭菜单
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
    // 当有选中文字或点击的是左侧输入框时，显示菜单
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
    window.open(searchUrl, '_blank');
    setShowMenu(false);
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
          borderRight: '1px solid #e8e8e8',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative' }}>
          <h2 className="mdui-typography-headline" style={{ fontSize: '18px', fontWeight: 600, color: '#262626', margin: 0 }}>
            新闻原文输入
          </h2>
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
              lineHeight: '1'
            }}
            title="更多选项"
          >
            ⋮
          </button>
          {showClearMenu && (
            <div
              ref={clearMenuRef}
              style={{
                position: 'absolute',
                top: '100%',
                right: '0',
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
                padding: '8px 0',
                zIndex: 1000,
                minWidth: '150px'
              }}
            >
              <div
          onClick={handleClearBrowserData}
          style={{
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#333',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
        >
          清理浏览器数据
              </div>
            </div>
          )}
        </div>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="请输入或粘贴待检测的新闻文本..."
          className="mdui-textfield-input"
          style={{ 
            height: 'calc(100% - 100px)', 
            resize: 'none',
            width: '100%',
            padding: '8px',
            boxSizing: 'border-box',
            border: '1px solid #ccc',
            borderRadius: '4px',
            textAlign: 'left'
          }}
          onContextMenu={(e) => handleContextMenu(e, e.target)}
        />
        <button 
          className="mdui-btn mdui-btn-raised mdui-ripple mdui-color-theme"
          onClick={handleDetect} 
          style={{ width: '100%', marginTop: '12px' }}
        >
          开始检测
        </button>
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
          padding: '20px',
          borderRight: 'none',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="mdui-typography-headline" style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#262626' }}>
            检测结果输出
          </h2>
          {extracting && (
            <button 
              className="mdui-btn mdui-btn-outlined"
              onClick={cancelExtraction}
              disabled={isCancelling}
              style={{ 
                padding: '6px 16px',
                fontSize: '14px',
                minWidth: 'auto'
              }}
            >
              {isCancelling ? '正在终止...' : '终止'}
            </button>
          )}
        </div>
        <div 
          style={{ 
            fontSize: '14px', 
            lineHeight: '1.6', 
            color: '#262626',
            padding: '8px',
            boxSizing: 'border-box',
            textAlign: 'left'
          }}
          onContextMenu={(e) => handleContextMenu(e, null)}
        >
          {/* 显示URL提取的内容 */}
          {extracting && <p>正在提取内容...</p>}
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
        <div
          className={`toast ${toastType}`}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '12px 24px',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 500,
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)',
            zIndex: 9999,
            backgroundColor: toastType === 'success' ? '#52c41a' : '#f5222d'
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* 右键菜单 */}
      {showMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuY,
            left: menuX,
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
            padding: '8px 0',
            zIndex: 9999
          }}
        >
          {/* 只有当有选中文字时显示复制 */}
          {selectedText && (
            <div
              style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '14px' }}
              onClick={handleCopy}
            >
              复制
            </div>
          )}
          {/* 只有当有选中文字且点击的是输入框时显示剪切 */}
          {selectedText && targetElement && (
            <div
              style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '14px' }}
              onClick={handleCut}
            >
              剪切
            </div>
          )}
          {/* 点击的是输入框时显示粘贴 */}
          {targetElement && (
            <div
              style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '14px' }}
              onClick={handlePaste}
            >
              粘贴
            </div>
          )}
          {/* 只有当有选中文字时显示搜索，且显示搜索内容 */}
          {selectedText && (
            <div
              style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '14px' }}
              onClick={handleSearch}
            >
              搜索 {selectedText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;