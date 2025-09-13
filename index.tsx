import { useState, useCallback, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Part } from "@google/genai";

const systemInstruction = `
        [1. 역할 정의]
        너는 대한민국 고등학교의 생활기록부 '행동특성 및 종합의견' 항목을 작성하는 데 특화된 AI 전문가야. 학생의 잠재력과 성장을 가장 잘 드러내는 교육적인 글을 작성하는 베테랑 고등학교 담임 교사의 역할을 수행해야 해.
        [2. 핵심 목표]
        교사가 제공하는 학생 정보를 바탕으로, 대입 평가에서 긍정적인 평가를 받을 수 있는 최고 수준의 행동특성 및 종합의견 문구를 생성한다. 추상적인 칭찬이 아닌, 구체적인 근거와 일화를 바탕으로 학생의 역량을 증명하고, 성장 과정을 포함하여 잠재력을 보여주어야 한다.
        [3. 행동특성 및 종합의견 작성 필수 원칙]
        A. 관찰 기반의 구체적 사례 제시: '성실함' 같은 추상적 표현은 반드시 그것을 뒷받침하는 구체적인 행동 관찰 사례와 함께 제시해야 한다. 만약 구체적 일화가 제공되지 않았다면, 주어진 핵심 역량에 기반하여 그럴듯하고 긍정적인 예시를 창작해서 포함시켜라.
        B. 학생의 성장과 변화 과정 서술: 장점 나열을 넘어, 어려움을 극복하거나 부족한 점을 개선하기 위해 노력한 과정을 보여준다.
        C. 잠재력과 발전 가능성 강조: 글의 마지막 부분에서는 학생의 노력과 현재 역량을 바탕으로 미래에 대한 긍정적인 기대감을 표현한다.
        D. 교사의 관점에서 평가 및 해석 포함: '~하는 모습이 인상적임', '~하는 점에서 잠재력이 돋보임' 과 같이 교사의 해석을 포함한다.
        E. 최신 생활기록부 기재요령 절대 준수 (가장 중요한 원칙):
          - 절대 포함 금지: 교내외 수상 실적, 독서 활동(책 제목, 저자), 자율/정규 동아리 활동 내용.
          - 오직 정규 교육과정(수업, 학급활동, 방과후학교 등)에서 교사가 직접 관찰하고 평가한 내용만 기반으로 작성한다.
        [4. 제약 조건]
        - 문체: 반드시 교사의 입장에서 학생을 관찰하고 평가하는 어조를 사용하며, 문장의 끝을 '~함', '~음', '~임'과 같은 개조식으로 마친다.
        - 분량: 한글 기준 1400바이트에서 1500바이트 사이 (약 460자 ~ 500자)로 생성한다.
        - 어조: 전문가적이고 긍정적이며, 학생의 잠재력과 성장이 드러나는 교육적인 문체를 사용한다.
      `;

interface ChatMessage {
  role: string;
  parts: Part[];
}

const App = () => {
  const [apiKey, setApiKey] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [isRateLimitModalOpen, setIsRateLimitModalOpen] = useState(false);
  const [apiUsageCount, setApiUsageCount] = useState({ flash: 0, pro: 0 });

  const [coreCompetencies, setCoreCompetencies] = useState<string[]>([]);
  const [customCompetency, setCustomCompetency] = useState("");
  const [anecdote, setAnecdote] = useState("");
  const [evaluation, setEvaluation] = useState<string[]>([]);
  const [customEvaluation, setCustomEvaluation] = useState("");
  
  const [userCompetencies, setUserCompetencies] = useState<string[]>([]);
  const [userEvaluations, setUserEvaluations] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [error, setError] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [followUpInput, setFollowUpInput] = useState("");
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const resetTimeoutRef = useRef<number | null>(null);

  // Check for API key and load user data on initial render
  useEffect(() => {
    try {
      const storedApiKey = localStorage.getItem('gemini_api_key');
      if (storedApiKey) {
        setApiKey(storedApiKey);
      } else {
        setIsApiKeyModalOpen(true);
      }
      
      const storedCompetencies = localStorage.getItem('user_competencies');
      if (storedCompetencies) setUserCompetencies(JSON.parse(storedCompetencies));
      const storedEvaluations = localStorage.getItem('user_evaluations');
      if (storedEvaluations) setUserEvaluations(JSON.parse(storedEvaluations));
    } catch (err: any) {
      console.error("Failed to load from local storage", err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    }
  }, []);

  // Load and check API usage count on initial render
  useEffect(() => {
    try {
      const storedUsage = localStorage.getItem('api_usage');
      const lastResetStr = localStorage.getItem('api_usage_last_reset');
      
      const now = new Date();
      // KST is UTC+9. 4 PM KST is 7 AM UTC.
      const resetHourUTC = 7; 

      let lastResetTime = lastResetStr ? new Date(lastResetStr) : new Date(0);

      // Determine the most recent reset time (4 PM KST / 7 AM UTC)
      const lastResetPoint = new Date(now);
      lastResetPoint.setUTCHours(resetHourUTC, 0, 0, 0);
      
      // If current time is before today's reset time, the last reset point was yesterday
      if (now.getUTCHours() < resetHourUTC) {
          lastResetPoint.setUTCDate(lastResetPoint.getUTCDate() - 1);
      }

      if (!storedUsage || !lastResetStr || lastResetTime < lastResetPoint) {
        // Time to reset
        const newUsage = { flash: 0, pro: 0 };
        setApiUsageCount(newUsage);
        localStorage.setItem('api_usage', JSON.stringify(newUsage));
        localStorage.setItem('api_usage_last_reset', now.toISOString());
      } else {
        // Load existing usage
        setApiUsageCount(JSON.parse(storedUsage));
      }
    } catch (err) {
      console.error("Failed to handle API usage data", err);
    }
  }, []);

  // Save custom lists to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('user_competencies', JSON.stringify(userCompetencies));
    } catch (err: any) {
      console.error("Failed to save competencies to local storage", err);
    }
  }, [userCompetencies]);

  useEffect(() => {
    try {
      localStorage.setItem('user_evaluations', JSON.stringify(userEvaluations));
    } catch (err: any) {
      console.error("Failed to save evaluations to local storage", err);
    }
  }, [userEvaluations]);
  
  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const competencyOptions = [
    "성실함과 책임감",
    "자기주도적 학습 태도",
    "따뜻한 리더십과 협업 능력",
    "창의적 문제 해결력",
    "긍정적 태도와 공동체 기여",
    "깊이 있는 탐구심",
    "학업에 대한 열정과 끈기",
    "타인에 대한 배려와 공감 능력",
  ];
  
  const evaluationOptions = [
    "자신만의 올바른 길을 묵묵히 걸어가는 인재임.",
    "공동체에 선한 영향력을 주는 학생임",
    "앞으로의 성장이 크게 기대됨",
    "진로 분야: 공학계열",
    "진로 분야: 경제학과",
    "진로 분야: 인문사회계열",
    "진로 분야: 의료계열",
  ];

  const handleSaveApiKey = () => {
    const trimmedKey = apiKeyInput.trim();
    if (trimmedKey) {
      try {
        localStorage.setItem('gemini_api_key', trimmedKey);
        setApiKey(trimmedKey);
        setIsApiKeyModalOpen(false);
        setError("");
      } catch (err: any) {
         console.error("Failed to save API key", err);
         setError("API 키를 저장하지 못했습니다. 브라우저 설정을 확인해주세요.");
      }
    } else {
        setError("API 키를 입력해주세요.");
    }
  };

  const handleChangeApiKey = () => {
      try {
        localStorage.removeItem('gemini_api_key');
      } catch (err: any) {
         console.error("Failed to remove API key", err);
      }
      setApiKey("");
      setApiKeyInput("");
      setIsApiKeyModalOpen(true);
  };
  
  const callGeminiApi = async (prompt: string, history: ChatMessage[]) => {
    if (!apiKey) {
      throw new Error("API 키가 설정되지 않았습니다.");
    }
    const ai = new GoogleGenAI({ apiKey });
    
    const contents = [...(history || []), { role: "user", parts: [{ text: prompt }] }];

    const response = await ai.models.generateContent({
        model: selectedModel,
        contents: contents,
        config: {
            systemInstruction: systemInstruction,
        }
    });
    
    return response.text;
  };

  const handleChipToggle = (item: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(
      list.includes(item)
        ? list.filter((i) => i !== item)
        : [...list, item]
    );
  };

  const handleAddCustomCompetency = () => {
    const trimmedValue = customCompetency.trim();
    if (trimmedValue && !competencyOptions.includes(trimmedValue) && !userCompetencies.includes(trimmedValue)) {
      setUserCompetencies(prev => [...prev, trimmedValue]);
      setCoreCompetencies(prev => [...prev, trimmedValue]);
    }
    setCustomCompetency('');
  };
  
  const handleAddCustomEvaluation = () => {
    const trimmedValue = customEvaluation.trim();
    if (trimmedValue && !evaluationOptions.includes(trimmedValue) && !userEvaluations.includes(trimmedValue)) {
      setUserEvaluations(prev => [...prev, trimmedValue]);
      setEvaluation(prev => [...prev, trimmedValue]);
    }
    setCustomEvaluation('');
  };

  const handleReset = () => {
    if (isConfirmingReset) {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
      
      try {
        localStorage.removeItem('user_competencies');
        localStorage.removeItem('user_evaluations');
      } catch (err: any) {
        console.error("Failed to clear local storage", err);
      }
      
      setCoreCompetencies([]);
      setCustomCompetency("");
      setAnecdote("");
      setEvaluation([]);
      setCustomEvaluation("");
      setUserCompetencies([]);
      setUserEvaluations([]);
      setGeneratedText("");
      setError("");
      setChatHistory([]);
      setFollowUpInput("");
      setIsLoading(false);
      setIsRevising(false);
      setIsConfirmingReset(false);
    } else {
      setIsConfirmingReset(true);
      resetTimeoutRef.current = window.setTimeout(() => {
        setIsConfirmingReset(false);
        resetTimeoutRef.current = null;
      }, 4000); 
    }
  };

  const handleGenerate = useCallback(async () => {
    if (coreCompetencies.length === 0) {
      setError("핵심 역량은 필수 입력 항목입니다.");
      return;
    }
    if (!apiKey) {
      setIsApiKeyModalOpen(true);
      setError("API 키를 먼저 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setGeneratedText("");
    setError("");

    try {
      const userPrompt = `
        [교사가 제공한 학생 정보]
        - 학생의 핵심 역량: ${coreCompetencies.join(", ")}
        - 핵심 역량을 증명하는 대표 일화: ${anecdote.trim() ? anecdote : '제공되지 않음'}
        - 교사의 종합 평가 및 진로 정보 (선택 사항): ${evaluation.join(", ")}

        [지시]
        위의 역할, 목표, 모든 원칙과 제약 조건을 반드시 준수하여, 제공된 학생 정보를 바탕으로 '행동특성 및 종합의견' 초안을 생성해줘.
      `;
      
      const text = await callGeminiApi(userPrompt, []);
      
      setGeneratedText(text || '');
      setChatHistory([
        { role: 'user', parts: [{ text: userPrompt }] },
        { role: 'model', parts: [{ text: text || '' }] }
      ]);

      // Increment usage count
      const newUsage = { ...apiUsageCount };
      if (selectedModel === 'gemini-2.5-flash') newUsage.flash += 1;
      else if (selectedModel === 'gemini-2.5-pro') newUsage.pro += 1;
      setApiUsageCount(newUsage);
      localStorage.setItem('api_usage', JSON.stringify(newUsage));

    } catch (e: any) {
      console.error(e);
      setError(e.message || "생성 중 오류가 발생했습니다. API 키가 유효한지 확인해주세요.");
    } finally {
      setIsLoading(false);
    }
  }, [coreCompetencies, anecdote, evaluation, apiKey, selectedModel]);

  const handleRevision = useCallback(async () => {
    if (!followUpInput.trim() || isRevising) return;

    setIsRevising(true);
    setError("");

    try {
      const text = await callGeminiApi(followUpInput, chatHistory);
      setGeneratedText(text || '');
      setChatHistory(prev => [
          ...prev,
          { role: 'user', parts: [{ text: followUpInput }] },
          { role: 'model', parts: [{ text: text || '' }] }
      ]);
      setFollowUpInput("");

      // Increment usage count
      const newUsage = { ...apiUsageCount };
      if (selectedModel === 'gemini-2.5-flash') newUsage.flash += 1;
      else if (selectedModel === 'gemini-2.5-pro') newUsage.pro += 1;
      setApiUsageCount(newUsage);
      localStorage.setItem('api_usage', JSON.stringify(newUsage));
      
    } catch (e: any) {
      console.error(e);
      setError(e.message || "수정 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsRevising(false);
    }
  }, [chatHistory, followUpInput, isRevising, apiKey, selectedModel]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedText).then(() => {
      alert("내용이 클립보드에 복사되었습니다.");
    });
  };

  const handleDeleteUserCompetency = (competencyToDelete: string) => {
    setUserCompetencies(prev => prev.filter(c => c !== competencyToDelete));
    setCoreCompetencies(prev => prev.filter(c => c !== competencyToDelete));
  };

  const handleDeleteUserEvaluation = (evaluationToDelete: string) => {
    setUserEvaluations(prev => prev.filter(e => e !== evaluationToDelete));
    setEvaluation(prev => prev.filter(e => e !== evaluationToDelete));
  };

  const isFormValid = coreCompetencies.length > 0;

  return (
    <>
      {isRateLimitModalOpen && (
        <div className="api-key-modal-overlay" onClick={() => setIsRateLimitModalOpen(false)}>
            <div className="api-key-modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>모델별 사용 한계 안내</h2>
                <p>모델별 사용 한도는 다음과 같으며, 사용량에 따라 제한될 수 있습니다.</p>
                <table className="rate-limit-table">
                    <thead>
                        <tr>
                            <th>모델</th>
                            <th>분당 요청 수 (RPM)</th>
                            <th>일일 요청 수 (RPD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Gemini 2.5 Pro</td>
                            <td>5</td>
                            <td>100</td>
                        </tr>
                        <tr>
                            <td>Gemini 2.5 Flash</td>
                            <td>10</td>
                            <td>250</td>
                        </tr>
                    </tbody>
                </table>
                <a href="https://ai.google.dev/gemini-api/docs/rate-limits?hl=ko" target="_blank" rel="noopener noreferrer" className="api-key-link">
                    자세한 내용 확인하기
                </a>
                <button onClick={() => setIsRateLimitModalOpen(false)}>닫기</button>
            </div>
        </div>
      )}
      {isApiKeyModalOpen && (
        <div className="api-key-modal-overlay">
            <div className="api-key-modal-content">
                <h2>Gemini API 키 입력</h2>
                <p>이 앱을 사용하려면 Google AI Studio에서 발급받은 Gemini API 키가 필요합니다. 입력된 키는 브라우저에만 저장됩니다.</p>
                <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="API 키를 여기에 붙여넣으세요"
                    aria-label="Gemini API Key Input"
                />
                <button onClick={handleSaveApiKey}>저장하고 시작하기</button>
                {error && <p className="error-message modal-error">{error}</p>}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="api-key-link">
                    API 키 발급받기
                </a>
            </div>
        </div>
      )}
      <div className={`container ${isApiKeyModalOpen || isRateLimitModalOpen ? 'blurred' : ''}`}>
        <header>
          <div className="header-top">
              <h1>AI 행특 도우미</h1>
          </div>
          <p className="header-description">AI와 함께 학생의 잠재력을 담아내는 행동특성 및 종합의견 완성</p>
          <div className="header-controls">
               <div className="model-selector">
                  <button 
                      className={`model-button ${selectedModel === 'gemini-2.5-flash' ? 'active' : ''}`}
                      onClick={() => setSelectedModel('gemini-2.5-flash')}
                  >
                      Flash ({apiUsageCount.flash})
                  </button>
                  <button 
                      className={`model-button ${selectedModel === 'gemini-2.5-pro' ? 'active' : ''}`}
                      onClick={() => setSelectedModel('gemini-2.5-pro')}
                  >
                      Pro ({apiUsageCount.pro})
                  </button>
              </div>
              <button className="change-key-button" onClick={handleChangeApiKey}>API 키 변경</button>
              <button className="info-button" onClick={() => setIsRateLimitModalOpen(true)}>모델 사용 한계</button>
              <button
                  className={`reset-button ${isConfirmingReset ? 'confirm' : ''}`}
                  onClick={handleReset}
              >
                  {isConfirmingReset ? '클릭하여 확인' : '초기화'}
              </button>
          </div>
        </header>
        
        <main>
          <div className="form-section">
            <h2>1단계: 학생의 핵심 역량 선택</h2>
            <div className="chip-container">
              {competencyOptions.map((opt) => (
                <button
                  key={opt}
                  className={`chip ${coreCompetencies.includes(opt) ? "selected" : ""}`}
                  onClick={() => handleChipToggle(opt, coreCompetencies, setCoreCompetencies)}
                  aria-pressed={coreCompetencies.includes(opt)}
                >
                  {opt}
                </button>
              ))}
              {userCompetencies.map((opt) => (
                  <button
                      key={opt}
                      className={`chip user-chip ${coreCompetencies.includes(opt) ? "selected" : ""}`}
                      onClick={() => handleChipToggle(opt, coreCompetencies, setCoreCompetencies)}
                      aria-pressed={coreCompetencies.includes(opt)}
                  >
                      {opt}
                      <span 
                          className="delete-chip" 
                          onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUserCompetency(opt);
                          }}
                          aria-label={`Delete ${opt}`}
                      >
                          &times;
                      </span>
                  </button>
              ))}
            </div>
            <div className="custom-input-container">
              <input
                type="text"
                value={customCompetency}
                onChange={(e) => setCustomCompetency(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomCompetency();
                  }
                }}
                placeholder="직접 입력..."
                aria-label="Custom core competency"
              />
              <button className="add-button" onClick={handleAddCustomCompetency} disabled={!customCompetency.trim()}>
                입력
              </button>
            </div>
          </div>
          <div className="form-section">
            <h2>2단계: 대표 일화 서술<span className="optional">(선택)</span></h2>
            <textarea
              value={anecdote}
              onChange={(e) => setAnecdote(e.target.value)}
              placeholder={`(상황) 학급 행사 준비 중 의견 충돌이 있었을 때,
(학생의 행동) 비협조적인 친구들에게 먼저 다가가 합리적인 대안을 제시하며 설득했고, 반장의 의견 조율을 적극적으로 도와주었습니다.
(결과/변화) 덕분에 행사를 성공적으로 마칠 수 있었고, 학급 분위기도 훨씬 좋아졌습니다.`}
              aria-label="Representative anecdote"
            ></textarea>
          </div>
          <div className="form-section">
            <h2>
              3단계: 종합 평가 및 진로
              <span className="optional">(선택)</span>
            </h2>
            <div className="chip-container">
              {evaluationOptions.map((opt) => (
                <button
                  key={opt}
                  className={`chip ${evaluation.includes(opt) ? "selected" : ""}`}
                  onClick={() => handleChipToggle(opt, evaluation, setEvaluation)}
                   aria-pressed={evaluation.includes(opt)}
                >
                  {opt}
                </button>
              ))}
              {userEvaluations.map((opt) => (
                  <button
                      key={opt}
                      className={`chip user-chip ${evaluation.includes(opt) ? "selected" : ""}`}
                      onClick={() => handleChipToggle(opt, evaluation, setEvaluation)}
                      aria-pressed={evaluation.includes(opt)}
                  >
                      {opt}
                      <span 
                          className="delete-chip" 
                          onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUserEvaluation(opt);
                          }}
                          aria-label={`Delete ${opt}`}
                      >
                          &times;
                      </span>
                  </button>
              ))}
            </div>
            <div className="custom-input-container">
              <input
                type="text"
                value={customEvaluation}
                onChange={(e) => setCustomEvaluation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomEvaluation();
                  }
                }}
                placeholder="직접 입력..."
                aria-label="Custom evaluation or career path"
              />
              <button className="add-button" onClick={handleAddCustomEvaluation} disabled={!customEvaluation.trim()}>
                입력
              </button>
            </div>
          </div>
          <button
            className="generate-button"
            onClick={handleGenerate}
            disabled={isLoading || !isFormValid}
          >
            {isLoading && <div className="spinner"></div>}
            {isLoading ? "생성 중..." : "생성하기"}
          </button>

          {error && !isApiKeyModalOpen && <p className="error-message">{error}</p>}
          
          {generatedText && (
            <section className="result-section" aria-live="polite">
              <div className="result-header">
                  <h3>생성된 초안</h3>
                  <button className="copy-button" onClick={handleCopy}>복사하기</button>
              </div>
              <div className="result-card">
                  {generatedText}
              </div>
              
              <div className="refine-section">
                <h3>초안 다듬기</h3>
                <textarea
                  value={followUpInput}
                  onChange={(e) => setFollowUpInput(e.target.value)}
                  placeholder="예: '좀 더 부드러운 어조로 바꿔주세요' 또는 '리더십 역량을 더 강조해주세요'"
                  aria-label="Refine the draft"
                ></textarea>
                <button
                  className="generate-button refine-button"
                  onClick={handleRevision}
                  disabled={isRevising || !followUpInput.trim()}
                >
                  {isRevising && <div className="spinner"></div>}
                  {isRevising ? "수정 중..." : "수정 요청하기"}
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
};

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}