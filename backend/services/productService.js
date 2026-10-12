const { v4: uuidv4 } = require('uuid');
const { DataStore } = require('./dataStore');
const aiService = require('./aiService');

const productStore = new DataStore('product_workspace');

const STOP_WORDS = new Set([
  '这个', '一个', '以及', '进行', '可以', '需要', '如果', '所以', '因为', '例如',
  '资料', '学习', '内容', '问题', '方法', '知识', '概念', 'the', 'and', 'for',
  'with', 'that', 'this', 'from', 'are', 'was', 'were', 'you', 'your'
]);

function now() {
  return new Date().toISOString();
}

function getUserId(userId = 'default') {
  return String(userId || 'default');
}

function getWorkspace(userId = 'default') {
  const id = getUserId(userId);
  const workspace = productStore.get(id) || {};
  const focus = workspace.focus || {};

  return {
    userId: id,
    profile: workspace.profile || {},
    knowledge: cleanKnowledge(Array.isArray(workspace.knowledge) ? workspace.knowledge : []),
    notebooks: cleanNotebooks(Array.isArray(workspace.notebooks) ? workspace.notebooks : []),
    sessions: Array.isArray(workspace.sessions) ? workspace.sessions : [],
    focus: {
      streak: Number(focus.streak || 0),
      minutes: Number(focus.minutes || 0),
      lastCheckIn: focus.lastCheckIn || null,
      completedTasks: Array.isArray(focus.completedTasks) ? focus.completedTasks : []
    },
    updatedAt: workspace.updatedAt || null
  };
}

function saveWorkspace(userId, updates) {
  const id = getUserId(userId);
  const current = getWorkspace(id);
  const next = { ...current, ...updates, userId: id, updatedAt: now() };
  productStore.set(id, next);
  return next;
}

function saveProfile(userId, profile) {
  return saveWorkspace(userId, { profile: { ...profile, updatedAt: now() } });
}

function addKnowledge(userId, input) {
  const workspace = getWorkspace(userId);
  const item = normalizeKnowledge(input);
  if (!item.content) throwStatus('content is required', 400);
  const knowledge = [item, ...workspace.knowledge].slice(0, 160);
  return { workspace: saveWorkspace(userId, { knowledge }), item };
}

function searchKnowledge(userId, query) {
  const workspace = getWorkspace(userId);
  return scoreItems(
    workspace.knowledge,
    query,
    item => `${item.title} ${item.tags.join(' ')} ${item.summary} ${item.content}`
  ).slice(0, 12);
}

function createNotebook(userId, input = {}) {
  const workspace = getWorkspace(userId);
  const notebook = {
    id: uuidv4(),
    title: cleanText(input.title, '') || '新的 Notebook',
    description: cleanText(input.description, ''),
    sources: [],
    guide: null,
    audioOverview: null,
    videoOverview: null,
    mindMap: null,
    artifacts: null,
    createdAt: now(),
    updatedAt: now()
  };
  const notebooks = [notebook, ...workspace.notebooks].slice(0, 40);
  return { workspace: saveWorkspace(userId, { notebooks }), notebook };
}

function addNotebookSource(userId, notebookId, input = {}) {
  let workspace = getWorkspace(userId);
  if (!workspace.notebooks.length) {
    workspace = createNotebook(userId, { title: input.notebookTitle || '默认 Notebook' }).workspace;
  }
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);

  const content = cleanText(input.content, '').trim();
  if (!content) throwStatus('content is required', 400);

  const source = {
    id: uuidv4(),
    title: cleanText(input.title, '') || content.slice(0, 28) || '未命名 Source',
    type: input.type || 'text',
    origin: cleanText(input.origin, ''),
    tags: Array.isArray(input.tags) ? input.tags : parseTags(input.tags),
    content,
    summary: summarizeContent(content, 260),
    chunks: chunkSource(content, input.sections),
    profile: buildSourceProfile(content, input.sections, input.type || 'text'),
    outline: buildSourceOutline(input.sections, content),
    importHealth: buildImportHealth(content, input.sections, input.type || 'text'),
    meta: input.meta || {},
    createdAt: now(),
    updatedAt: now()
  };

  notebook.sources = [source, ...(notebook.sources || [])].slice(0, 100);
  touchNotebook(notebook);

  const knowledge = [normalizeKnowledge({ ...source, source: notebook.title }), ...workspace.knowledge].slice(0, 160);
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks, knowledge }), notebook, source };
}

function updateNotebookSource(userId, notebookId, sourceId, input = {}) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const source = (notebook.sources || []).find(item => item.id === sourceId);
  if (!source) throwStatus('source not found', 404);

  if (input.title !== undefined) source.title = cleanText(input.title, '') || source.title;
  if (input.content !== undefined) {
    source.content = cleanText(input.content, '').trim();
    source.summary = summarizeContent(source.content, 260);
    source.chunks = chunkSource(source.content, input.sections);
  }
  if (input.tags !== undefined) source.tags = Array.isArray(input.tags) ? input.tags : parseTags(input.tags);
  if (input.meta !== undefined) source.meta = { ...(source.meta || {}), ...(input.meta || {}) };
  source.updatedAt = now();
  touchNotebook(notebook);
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks }), notebook, source };
}

function deleteNotebookSource(userId, notebookId, sourceId) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const before = (notebook.sources || []).length;
  notebook.sources = (notebook.sources || []).filter(item => item.id !== sourceId);
  if (notebook.sources.length === before) throwStatus('source not found', 404);
  touchNotebook(notebook);
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks }), notebook };
}

function deleteNotebook(userId, notebookId) {
  const workspace = getWorkspace(userId);
  const before = (workspace.notebooks || []).length;
  workspace.notebooks = (workspace.notebooks || []).filter(item => item.id !== notebookId);
  if (workspace.notebooks.length === before) throwStatus('notebook not found', 404);
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks }) };
}

// 清空指定类型的生成式学习资料
function clearNotebookArtifact(userId, notebookId, artifactType) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const fieldMap = {
    guide: 'guide',
    audio: 'audioOverview',
    video: 'videoOverview',
    'mind-map': 'mindMap',
    artifacts: 'artifacts'
  };
  const field = fieldMap[artifactType];
  if (!field) throwStatus('未知的资料类型', 400);
  notebook[field] = null;
  touchNotebook(notebook);
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks }), notebook };
}

function searchNotebookSources(userId, notebookId, query) {
  const notebook = getNotebook(getWorkspace(userId), notebookId);
  if (!notebook) return [];
  const chunks = getNotebookChunks(notebook);
  const ranked = scoreItems(
    chunks,
    query,
    chunk => `${chunk.sourceTitle} ${chunk.sourceType} ${chunk.label} ${chunk.text} ${(chunk.tokens || []).join(' ')}`
  );
  return diversifyHits(ranked, 12);
}

function answerNotebookSources(userId, notebookId, question) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const hits = searchNotebookSources(userId, notebookId, question);
  const selected = hits.length ? hits.slice(0, 8) : getNotebookChunks(notebook).slice(0, 5);
  const concepts = extractKeywords(`${question}\n${selected.map(item => item.text).join('\n')}`).slice(0, 6);
  const grouped = groupBySource(selected);
  const claimCitations = buildClaimCitations(question, selected, concepts);
  const confidence = estimateAnswerConfidence(question, selected, notebook);
  const quality = analyzeNotebookQuality(notebook);

  const answer = [
    `## 基于 Sources 的回答`,
    selected.length
      ? `我检索到 ${selected.length} 个最相关片段，优先依据 ${Object.keys(grouped).length} 个 Source 回答。`
      : '当前 Source 还不够，先给出基于已有资料的保守回答。',
    '',
    '### 直接结论',
    buildConclusion(question, selected, concepts),
    '',
    '### 证据拆解',
    ...selected.slice(0, 5).map((item, index) => `${index + 1}. ${summarizeContent(item.text, 150)} [${item.citation}]`),
    '',
    '### 建议追问',
    ...buildSuggestedQuestions(concepts, notebook).slice(0, 3).map(item => `- ${item}`)
  ].join('\n');

  return {
    notebook,
    answer,
    citations: selected,
    claimCitations,
    suggestedQuestions: buildSuggestedQuestions(concepts, notebook),
    confidence,
    quality,
    coverage: {
      sourceCount: (notebook.sources || []).length,
      chunkCount: getNotebookChunks(notebook).length,
      matchedCount: hits.length
    }
  };
}

function generateSourceGuide(userId, notebookId) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const text = collectNotebookText(notebook);
  const keyConcepts = extractKeywords(text).slice(0, 14);
  const sourceBriefs = (notebook.sources || []).map(source => ({
    sourceId: source.id,
    title: source.title,
    type: source.type,
    summary: summarizeContent(source.content, 220),
    citations: (source.chunks || []).slice(0, 2).map(chunk => `${source.title} · ${chunk.label}`)
  }));

  const guide = {
    summary: summarizeContent(text, 520) || '还没有可分析的资料。',
    sourceBriefs,
    keyConcepts,
    quality: analyzeNotebookQuality(notebook),
    claims: buildGuideClaims(notebook, text),
    outline: (notebook.sources || []).slice(0, 8).map(source => ({
      sourceId: source.id,
      title: source.title,
      outline: source.outline || [],
      health: source.importHealth || null
    })),
    suggestedQuestions: buildSuggestedQuestions(keyConcepts, notebook),
    studyGuide: buildStudyGuide(keyConcepts, notebook),
    faq: buildFaq(keyConcepts, notebook),
    timeline: buildTimeline(text),
    gaps: buildGaps(notebook),
    generatedAt: now()
  };

  notebook.guide = guide;
  notebook.updatedAt = now();
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks }), guide, notebook };
}

function generateAudioOverview(userId, notebookId) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const guide = notebook.guide || generateSourceGuide(userId, notebookId).guide;
  const concepts = (guide.keyConcepts || []).slice(0, 6);

  const script = [
    `主持人 A：今天我们用 6 分钟梳理《${notebook.title}》。先给结论：${guide.summary}`,
    `主持人 B：我会把它拆成 ${concepts.length || 1} 个抓手：${concepts.join('、') || '核心资料'}。`,
    ...concepts.map((item, index) => `主持人 A：第 ${index + 1} 个关键词是「${item}」。复习时要回到引用片段，找定义、例子和易错点。`),
    `主持人 B：最后把这些概念做成闪卡，再用测验检查能不能脱离原文复述。`
  ];

  const audioOverview = {
    title: `${notebook.title} 中文双人讲解`,
    format: 'script',
    duration: '约 6 分钟',
    speakers: ['主持人 A', '主持人 B'],
    hook: summarizeContent(guide.summary, 160),
    interactivePrompts: concepts.slice(0, 5).map(item => `暂停并追问：“${item}”和资料中的哪条证据最相关？`),
    evidenceBeats: concepts.slice(0, 6).map(item => {
      const citation = findBestCitation(notebook, item);
      return {
        concept: item,
        citation: citation?.citation || '',
        text: summarizeContent(citation?.text || '', 140)
      };
    }),
    chapters: concepts.map((item, index) => ({
      time: `0${Math.min(index + 1, 8)}:00`,
      title: item,
      citation: findBestCitation(notebook, item)?.citation || ''
    })),
    script,
    generatedAt: now()
  };

  notebook.audioOverview = audioOverview;
  notebook.updatedAt = now();
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks }), audioOverview, notebook };
}

function generateVideoOverview(userId, notebookId) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const guide = notebook.guide || generateSourceGuide(userId, notebookId).guide;
  const concepts = (guide.keyConcepts || []).slice(0, 5);
  const scenes = [
    {
      title: '开场结论',
      visual: '标题、核心结论和 Source 数量',
      narration: `这份 Notebook 主要讨论：${summarizeContent(guide.summary, 120)}`
    },
    ...concepts.map((item, index) => ({
      title: `概念 ${index + 1}: ${item}`,
      visual: '关键词卡片 + 引用片段高亮',
      narration: `先定位「${item}」在资料中的定义，再看它如何被例子或题目使用。`,
      citation: findBestCitation(notebook, item)?.citation || ''
    })),
    {
      title: '复习路线',
      visual: '三步行动清单',
      narration: '先读 Source Guide，再做闪卡，最后用测验暴露薄弱点。'
    }
  ];

  const videoOverview = {
    title: `${notebook.title} 视频概览脚本`,
    format: 'storyboard',
    aspectRatio: '16:9',
    duration: '约 3 分钟',
    scenes,
    visualAssets: concepts.slice(0, 6).map(item => {
      const citation = findBestCitation(notebook, item);
      return {
        label: item,
        type: 'source-card',
        citation: citation?.citation || '',
        text: summarizeContent(citation?.text || '', 110)
      };
    }),
    exportPlan: [
      '生成 8-12 页可编辑 slide deck',
      '每页绑定一个 Source citation',
      'TTS 旁白与字幕逐场景对齐',
      '导出 PPTX / MP4 时保留引用页'
    ],
    generatedAt: now()
  };

  notebook.videoOverview = videoOverview;
  notebook.updatedAt = now();
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks }), videoOverview, notebook };
}

function generateMindMap(userId, notebookId) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const guide = notebook.guide || generateSourceGuide(userId, notebookId).guide;
  const concepts = getArtifactConcepts(guide, notebook).slice(0, 18);
  const chunks = getNotebookChunks(notebook);

  // 尝试用 AI 生成更有逻辑的思维导图
  let branches;
  try {
    branches = buildAIMindMapBranches(notebook, guide, concepts, chunks);
  } catch (e) {
    // AI 不可用时降级为算法生成
    branches = buildMindMapBranches(notebook, guide, concepts, chunks);
  }

  const nodes = flattenMindMapNodes(notebook, branches);
  const edges = flattenMindMapEdges(branches);
  const mindMap = {
    title: notebook.title,
    centralQuestion: guide.summary || `理解 ${notebook.title} 的核心结构`,
    branches,
    insights: buildMindMapInsights(notebook, branches),
    evidenceTrail: buildEvidenceTrail(branches),
    learningPath: buildMindMapLearningPath(branches),
    nodes,
    edges,
    generatedAt: now()
  };
  notebook.mindMap = mindMap;
  notebook.updatedAt = now();
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks }), mindMap, notebook };
}

// 同步包装：尝试用 AI 生成结构化思维导图分支
function buildAIMindMapBranches(notebook, guide, concepts, chunks) {
  if (!aiService.isApiKeyValid()) {
    throw new Error('AI not available');
  }

  const textSample = collectNotebookText(notebook).slice(0, 4000);
  const prompt = `请基于以下学习资料，生成一个结构化的思维导图。

要求：
1. 提取 4-8 个核心主题作为一级分支，每个主题应该是资料中的关键章节或核心概念
2. 每个分支下给出 2-4 个子概念，子概念必须和主题有明确的逻辑关系（因果、组成、应用等）
3. 用简短的说明解释每个分支的核心内容

请严格用以下 JSON 格式返回（只返回 JSON，不要其他文字）：
{
  "branches": [
    {
      "title": "主题名称",
      "summary": "一句话说明这个主题讲什么",
      "children": ["子概念1", "子概念2", "子概念3"]
    }
  ]
}

资料内容：
${textSample}`;

  // 同步调用 AI（在 generateMindMap 的同步上下文中）
  let aiResult;
  const { chat } = aiService;
  // 使用 deasync 或直接同步等待——这里用 child_process 不现实
  // 改为：在 controller 层做异步，这里只做降级
  throw new Error('Use async path instead');
}

// 异步版本：在 controller 中调用
async function generateMindMapAsync(userId, notebookId) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const guide = notebook.guide || generateSourceGuide(userId, notebookId).guide;
  const concepts = getArtifactConcepts(guide, notebook).slice(0, 18);
  const chunks = getNotebookChunks(notebook);

  let branches;
  if (aiService.isApiKeyValid()) {
    try {
      branches = await buildAIMindMapBranchesAsync(notebook, guide, concepts, chunks);
    } catch (e) {
      branches = buildMindMapBranches(notebook, guide, concepts, chunks);
    }
  } else {
    branches = buildMindMapBranches(notebook, guide, concepts, chunks);
  }

  const nodes = flattenMindMapNodes(notebook, branches);
  const edges = flattenMindMapEdges(branches);
  const mindMap = {
    title: notebook.title,
    centralQuestion: guide.summary || `理解 ${notebook.title} 的核心结构`,
    branches,
    insights: buildMindMapInsights(notebook, branches),
    evidenceTrail: buildEvidenceTrail(branches),
    learningPath: buildMindMapLearningPath(branches),
    nodes,
    edges,
    generatedAt: now()
  };
  notebook.mindMap = mindMap;
  notebook.updatedAt = now();
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks }), mindMap, notebook };
}

// 分阶段分析：第一阶段——文档结构识别
function analyzeNotebookStructure(userId, notebookId) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const chunks = getNotebookChunks(notebook);

  // 检测文档结构
  const sections = detectDocumentSections(chunks);
  const pptSections = detectPptPdfSections(chunks);
  const usingPptMode = pptSections.length >= 3;
  const finalSections = usingPptMode ? pptSections : sections;

  // 统计信息
  const totalChunks = chunks.length;
  const totalChars = chunks.reduce((sum, c) => sum + (c.text || '').length, 0);
  const sourceCount = (notebook.sources || []).length;

  // 识别文档类型
  let docType = '普通文档';
  if (usingPptMode) docType = 'PPT 转 PDF';
  else if (sourceCount > 1) docType = '多资料合集';
  else if (sections.length >= 5) docType = '结构化文档';

  return {
    stage: 'structure',
    docType,
    totalSections: finalSections.length,
    totalChunks,
    totalChars,
    sourceCount,
    sections: finalSections.map((s, i) => ({
      index: i + 1,
      title: s.title,
      chunkCount: s.chunks.length,
      preview: summarizeContent(s.chunks[0]?.text || '', 60)
    })),
    usingPptMode
  };
}

// 分阶段分析：第二阶段——概念提取
function analyzeNotebookConcepts(userId, notebookId) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const chunks = getNotebookChunks(notebook);

  const sections = detectDocumentSections(chunks);
  const pptSections = detectPptPdfSections(chunks);
  const usingPptMode = pptSections.length >= 3;
  const finalSections = usingPptMode ? pptSections : sections;

  // 对每个章节提取关键概念
  const sectionConcepts = finalSections.map((section, idx) => {
    const keyPoints = extractKeyPoints(section.chunks, 5);
    const definitions = findDefinitions(section.chunks);
    const relationships = findRelationships(section.chunks);
    return {
      sectionIndex: idx + 1,
      sectionTitle: section.title,
      keyPoints: keyPoints.map(p => ({ label: p.label, reason: p.reason })),
      definitions: definitions.slice(0, 3),
      relationships: relationships.slice(0, 3)
    };
  });

  // 统计
  const allConcepts = sectionConcepts.flatMap(s => s.keyPoints);
  const allDefinitions = sectionConcepts.flatMap(s => s.definitions);
  const allRelationships = sectionConcepts.flatMap(s => s.relationships);

  return {
    stage: 'concepts',
    totalConcepts: allConcepts.length,
    totalDefinitions: allDefinitions.length,
    totalRelationships: allRelationships.length,
    sectionConcepts
  };
}

// 从文本中查找定义句
function findDefinitions(chunks) {
  const definitions = [];
  const defPattern = /(?:称为|叫做|叫作|是指|定义为|定义是|指的是)[^。！？]*[。！？]/g;

  for (const chunk of chunks) {
    const text = chunk.text || '';
    let match;
    while ((match = defPattern.exec(text)) !== null) {
      const sentence = match[0].trim();
      if (sentence.length < 10 || sentence.length > 100) continue;
      const formulaRatio = (sentence.match(/[\d\(\)\[\]\{\}=+\-*/×÷∑∫∮∇∂·→←↑↓]/g) || []).length / sentence.length;
      if (formulaRatio > 0.3) continue;
      definitions.push({
        text: sentence,
        citation: chunk.citation
      });
    }
  }
  return definitions;
}

// 从文本中查找关系句
function findRelationships(chunks) {
  const relationships = [];
  const patterns = [
    { regex: /(?:因此|所以|从而|导致|使得)[^。！？]*[。！？]/g, type: '因果' },
    { regex: /(?:由于|因为)[^。！？]*[。！？]/g, type: '原因' },
    { regex: /(?:为了|以便|目的是|旨在)[^。！？]*[。！？]/g, type: '目的' },
    { regex: /(?:如果|若|假设|假定)[^。！？]*[。！？]/g, type: '条件' },
    { regex: /(?:与|和|相比|不同于|区别于)[^。！？]*[。！？]/g, type: '对比' },
  ];

  for (const chunk of chunks) {
    const text = chunk.text || '';
    for (const { regex, type } of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const sentence = match[0].trim();
        if (sentence.length < 10 || sentence.length > 100) continue;
        const formulaRatio = (sentence.match(/[\d\(\)\[\]\{\}=+\-*/×÷∑∫∮∇∂·→←↑↓]/g) || []).length / sentence.length;
        if (formulaRatio > 0.3) continue;
        relationships.push({
          type,
          text: sentence,
          citation: chunk.citation
        });
      }
    }
  }
  return relationships;
}

async function buildAIMindMapBranchesAsync(notebook, guide, concepts, chunks) {
  const textSample = collectNotebookText(notebook).slice(0, 4000);
  const prompt = `请基于以下学习资料，生成一个结构化的思维导图。

要求：
1. 提取 4-8 个核心主题作为一级分支，每个主题应该是资料中的关键章节或核心概念
2. 每个分支下给出 2-4 个子概念，子概念必须和主题有明确的逻辑关系（因果、组成、应用等）
3. 用简短的说明解释每个分支的核心内容

请严格用以下 JSON 格式返回（只返回 JSON，不要其他文字）：
{
  "branches": [
    {
      "title": "主题名称",
      "summary": "一句话说明这个主题讲什么",
      "children": ["子概念1", "子概念2", "子概念3"]
    }
  ]
}

资料内容：
${textSample}`;

  const result = await aiService.chat(prompt, { mode: 'tutor', maxTokens: 2000 });
  const content = result.content || result.response || '';

  // 解析 AI 返回的 JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 返回格式不对');
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.branches || !Array.isArray(parsed.branches)) throw new Error('AI 返回分支格式不对');

  // 转换为 mindmap branches 格式
  return parsed.branches.slice(0, 8).map((branch, index) => {
    const branchConcept = branch.title || `分支${index + 1}`;
    const hits = scoreItems(chunks, branchConcept, chunk => `${chunk.sourceTitle} ${chunk.label} ${chunk.text}`).slice(0, 3);
    const relatedConcepts = (branch.children || []).slice(0, 4).map(child => ({
      label: child,
      reason: `${branchConcept}的子概念`,
      citation: hits[0]?.citation || findBestCitation(notebook, child)?.citation || ''
    }));
    const evidence = hits.map(hit => ({
      citation: hit.citation,
      sourceId: hit.sourceId,
      chunkId: hit.id,
      sourceTitle: hit.sourceTitle,
      text: summarizeContent(hit.text, 130),
      score: hit.score
    }));
    return {
      id: `b${index + 1}`,
      title: branchConcept,
      role: index === 0 ? '核心主干' : index < 3 ? '关键支撑' : '扩展分支',
      priority: evidence.length >= 2 ? '高' : evidence.length >= 1 ? '中' : '待补充',
      coverage: Math.round((hits.length / Math.max(chunks.length, 1)) * 100),
      summary: branch.summary || summarizeContent(evidence[0]?.text || guide.summary || branchConcept, 180),
      sourceTitles: [...new Set(hits.map(hit => hit.sourceTitle).filter(Boolean))],
      relatedConcepts,
      evidence,
      questions: [
        `“${branchConcept}”在这份资料中的定义是什么？`,
        `“${branchConcept}”包含哪些子概念？`,
        `哪些证据最能支持“${branchConcept}”？`
      ]
    };
  });
}

function generateStudioArtifacts(userId, notebookId) {
  const workspace = getWorkspace(userId);
  const notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  const guide = notebook.guide || generateSourceGuide(userId, notebookId).guide;
  const concepts = getArtifactConcepts(guide, notebook);

  const artifacts = {
    report: {
      title: `${notebook.title} 复习报告`,
      sections: [
        { title: '核心摘要', content: guide.summary },
        { title: '关键概念', content: concepts.join('、') || '暂无' },
        { title: '复习路线', content: (guide.studyGuide || []).join('\n') },
        { title: '资料缺口', content: (guide.gaps || []).join('\n') }
      ]
    },
    flashcards: concepts.slice(0, 10).map(item => {
      const citation = findBestCitation(notebook, item);
      return {
        front: item,
        back: `解释「${item}」的定义、适用场景和一个例子。`,
        citation: citation?.citation || '',
        difficulty: citation?.score > 5 ? '重点' : '普通'
      };
    }),
    quiz: concepts.slice(0, 8).map((item, index) => {
      const citation = findBestCitation(notebook, item);
      return {
        id: index + 1,
        question: `请基于资料解释「${item}」，并说明它最容易和什么概念混淆。`,
        answer: `参考 ${citation?.citation || 'Source'}，先给定义，再补例子和易错点。`,
        citation: citation?.citation || ''
      };
    }),
    timeline: guide.timeline,
    comparison: compareSources(notebook.sources || []),
    sourceMatrix: buildSourceMatrix(notebook.sources || [], concepts),
    briefingDoc: buildBriefingDoc(notebook, guide, concepts),
    citationDigest: getNotebookChunks(notebook).slice(0, 10).map(item => ({
      citation: item.citation,
      text: summarizeContent(item.text, 150),
      sourceId: item.sourceId,
      chunkId: item.id
    })),
    masteryPlan: concepts.slice(0, 8).map((item, index) => ({
      step: index + 1,
      concept: item,
      action: `回到引用证据解释“${item}”，再用自己的话写一个例子。`,
      check: `不看原文回答：“${item}”解决了什么问题？`,
      citation: findBestCitation(notebook, item)?.citation || ''
    })),
    evidenceTable: concepts.slice(0, 10).map(item => {
      const citation = findBestCitation(notebook, item);
      return {
        concept: item,
        claim: citation ? summarizeContent(citation.text, 120) : '需要补充证据',
        citation: citation?.citation || '',
        confidence: citation?.score >= 8 ? 'high' : citation?.score >= 3 ? 'medium' : 'low'
      };
    }),
    exports: [
      { type: 'briefing-doc', label: 'Briefing Doc', ready: true },
      { type: 'flashcards', label: 'Flashcards', ready: true },
      { type: 'quiz', label: 'Quiz', ready: true },
      { type: 'pptx', label: 'Slide Deck', ready: false, note: '下一步接入 PPTX 渲染' },
      { type: 'audio', label: 'Audio File', ready: false, note: '下一步接入 TTS' }
    ],
    generatedAt: now()
  };

  notebook.artifacts = artifacts;
  notebook.updatedAt = now();
  return { workspace: saveWorkspace(userId, { notebooks: workspace.notebooks }), artifacts, notebook };
}

function generateCompleteStudio(userId, notebookId) {
  const guide = generateSourceGuide(userId, notebookId);
  const audio = generateAudioOverview(userId, notebookId);
  const video = generateVideoOverview(userId, notebookId);
  const mindMap = generateMindMap(userId, notebookId);
  const artifacts = generateStudioArtifacts(userId, notebookId);
  return {
    workspace: artifacts.workspace,
    notebook: artifacts.notebook,
    guide: guide.guide,
    audioOverview: audio.audioOverview,
    videoOverview: video.videoOverview,
    mindMap: mindMap.mindMap,
    artifacts: artifacts.artifacts
  };
}

function exportNotebookArtifact(userId, notebookId, type = 'briefing-md') {
  let workspace = getWorkspace(userId);
  let notebook = getNotebook(workspace, notebookId);
  if (!notebook) throwStatus('notebook not found', 404);
  if (!notebook.guide || !notebook.artifacts || !notebook.mindMap) {
    generateCompleteStudio(userId, notebookId);
    workspace = getWorkspace(userId);
    notebook = getNotebook(workspace, notebookId);
  }

  const safeTitle = slugifyFileName(notebook.title || 'notebook');
  const exporters = {
    'briefing-md': () => ({
      filename: `${safeTitle}-briefing.md`,
      contentType: 'text/markdown; charset=utf-8',
      body: renderBriefingMarkdown(notebook)
    }),
    'report-html': () => ({
      filename: `${safeTitle}-report.html`,
      contentType: 'text/html; charset=utf-8',
      body: renderReportHtml(notebook)
    }),
    'flashcards-csv': () => ({
      filename: `${safeTitle}-flashcards.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: csvRows([['front', 'back', 'citation', 'difficulty'], ...(notebook.artifacts?.flashcards || []).map(card => [card.front, card.back, card.citation, card.difficulty])])
    }),
    'quiz-json': () => ({
      filename: `${safeTitle}-quiz.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(notebook.artifacts?.quiz || [], null, 2)
    }),
    'mindmap-json': () => ({
      filename: `${safeTitle}-mindmap.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(notebook.mindMap || {}, null, 2)
    }),
    'citations-csv': () => ({
      filename: `${safeTitle}-citations.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: csvRows([['citation', 'text', 'sourceId', 'chunkId'], ...(notebook.artifacts?.citationDigest || []).map(item => [item.citation, item.text, item.sourceId, item.chunkId])])
    }),
    'slides-html': () => ({
      filename: `${safeTitle}-slide-deck.html`,
      contentType: 'text/html; charset=utf-8',
      body: renderSlideDeckHtml(notebook)
    }),
    'notebook-json': () => ({
      filename: `${safeTitle}-notebook.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(notebook, null, 2)
    })
  };

  const build = exporters[type] || exporters['briefing-md'];
  return build();
}

function getArtifactConcepts(guide, notebook) {
  const concepts = (guide.keyConcepts || []).filter(Boolean).slice(0, 12);
  if (concepts.length) return concepts;
  const fromSources = (notebook.sources || []).map(source => source.title).filter(Boolean).slice(0, 6);
  return fromSources.length ? fromSources : ['核心概念', '关键例子', '易错点'];
}

function saveSession(userId, session) {
  const workspace = getWorkspace(userId);
  const record = {
    id: session.id || uuidv4(),
    title: session.title || '学习会话',
    mode: session.mode || 'tutor',
    messages: Array.isArray(session.messages) ? session.messages.slice(-30) : [],
    createdAt: session.createdAt || now(),
    updatedAt: now()
  };
  const sessions = [record, ...workspace.sessions.filter(item => item.id !== record.id)].slice(0, 40);
  return { workspace: saveWorkspace(userId, { sessions }), session: record };
}

function checkInFocus(userId, input = {}) {
  const workspace = getWorkspace(userId);
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = workspace.focus.lastCheckIn ? workspace.focus.lastCheckIn.slice(0, 10) : null;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const focus = {
    streak: lastDay === today ? workspace.focus.streak : lastDay === yesterday ? workspace.focus.streak + 1 : 1,
    minutes: Math.max(0, (workspace.focus.minutes || 0) + Number(input.minutes || 0)),
    lastCheckIn: now(),
    completedTasks: [...workspace.focus.completedTasks, ...(input.task ? [{ task: input.task, at: now() }] : [])].slice(-60)
  };
  return saveWorkspace(userId, { focus });
}

async function webSearch(query) {
  const q = String(query || '').trim();
  if (!q) throwStatus('query is required', 400);
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&no_html=1`;
  const response = await fetch(url, { headers: { 'User-Agent': 'XuebanAI/1.0 learning assistant' } });
  if (!response.ok) throw new Error(`search failed: ${response.status}`);
  const data = await response.json();
  const related = Array.isArray(data.RelatedTopics) ? flattenRelated(data.RelatedTopics) : [];
  return {
    query: q,
    abstract: data.AbstractText || '',
    source: data.AbstractSource || '',
    url: data.AbstractURL || '',
    results: related.slice(0, 8),
    searchUrl: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
  };
}

function normalizeKnowledge(input) {
  const content = cleanText(input.content, '').trim();
  return {
    id: uuidv4(),
    title: cleanText(input.title, '') || content.slice(0, 28) || '未命名资料',
    type: input.type || 'note',
    source: cleanText(input.source, ''),
    tags: Array.isArray(input.tags) ? input.tags : parseTags(input.tags),
    content,
    summary: summarizeContent(content, 220),
    createdAt: now(),
    updatedAt: now()
  };
}

function chunkSource(content, sections) {
  const rawSections = Array.isArray(sections) && sections.length
    ? sections
    : splitIntoSections(content, '段落');
  const chunks = rawSections.length
    ? rawSections
    : [{ label: '段落 1', text: cleanText(content, '').trim() }].filter(item => item.text);

  return chunks.slice(0, 180).map((item, index) => ({
    id: `c${index + 1}`,
    index: index + 1,
    label: cleanText(item.label, '') || `段落 ${index + 1}`,
    text: summarizeContent(cleanText(item.text, ''), 1500),
    tokens: tokenize(item.text)
  }));
}

function splitIntoSections(content, labelPrefix = '段落') {
  return cleanText(content, '')
    .split(/\n{2,}|(?<=[。！？.!?])\s+/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 220)
    .map((text, index) => ({ label: `${labelPrefix} ${index + 1}`, text }));
}

function getNotebook(workspace, notebookId) {
  if (notebookId) return (workspace.notebooks || []).find(item => item.id === notebookId);
  return (workspace.notebooks || [])[0];
}

function getNotebookChunks(notebook) {
  return (notebook.sources || []).flatMap(source =>
    (source.chunks || []).map(chunk => ({
      ...chunk,
      sourceId: source.id,
      sourceTitle: source.title,
      sourceType: source.type,
      origin: source.origin,
      citation: `${source.title} · ${chunk.label || `#${chunk.index}`}`
    }))
  );
}

function collectNotebookText(notebook) {
  return (notebook.sources || []).map(source => `${source.title}\n${source.content}`).join('\n\n');
}

function buildSourceProfile(content, sections, type = 'text') {
  const text = cleanText(content, '');
  const words = tokenize(text);
  const sectionCount = Array.isArray(sections) && sections.length ? sections.length : splitIntoSections(text).length;
  const concepts = extractKeywords(text).slice(0, 12);
  const claims = extractClaimSentences(text).slice(0, 8);
  return {
    type,
    charCount: text.length,
    tokenCount: words.length,
    sectionCount,
    concepts,
    claims,
    density: Number((words.length / Math.max(sectionCount, 1)).toFixed(2))
  };
}

function buildSourceOutline(sections, content) {
  const rawSections = Array.isArray(sections) && sections.length ? sections : splitIntoSections(content);
  return rawSections.slice(0, 18).map((section, index) => ({
    id: `o${index + 1}`,
    title: cleanText(section.label, '') || `Section ${index + 1}`,
    summary: summarizeContent(section.text, 150),
    concepts: extractKeywords(section.text).slice(0, 5)
  }));
}

function buildImportHealth(content, sections, type = 'text') {
  const text = cleanText(content, '');
  const warnings = [];
  if (text.length < 300) warnings.push('资料文本偏短，回答可能缺少上下文。');
  if (type === 'pdf' && text.length < 800) warnings.push('PDF 可读文本较少，可能是扫描版或版式解析不完整。');
  if (!Array.isArray(sections) || !sections.length) warnings.push('没有检测到结构化章节，系统会按段落切分。');
  if (text.length > 120000) warnings.push('资料很长，建议后续接入异步索引和向量检索。');
  return {
    score: Math.max(35, 100 - warnings.length * 18),
    warnings,
    readable: text.length > 0,
    checkedAt: now()
  };
}

function extractClaimSentences(text) {
  return cleanText(text, '')
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map(item => item.trim())
    .filter(item => item.length >= 18)
    .filter(item => /(是|说明|表明|指出|提出|证明|because|shows|suggests|indicates|proposes|demonstrates)/i.test(item))
    .slice(0, 20);
}

function diversifyHits(hits, limit = 12) {
  const selected = [];
  const perSource = new Map();
  for (const hit of hits) {
    const used = perSource.get(hit.sourceId) || 0;
    if (used >= 3 && selected.length < Math.ceil(limit * 0.75)) continue;
    selected.push(hit);
    perSource.set(hit.sourceId, used + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function buildClaimCitations(question, hits, concepts) {
  const seeds = [
    ...extractClaimSentences(hits.map(hit => hit.text).join('\n')).slice(0, 4),
    ...concepts.slice(0, 4).map(concept => `${concept} 是回答“${question}”时需要核对的关键概念。`)
  ];
  const seen = new Set();
  return seeds.map(seed => {
    const best = scoreItems(hits, seed, hit => `${hit.sourceTitle} ${hit.text}`)[0] || hits[0];
    return best ? {
      claim: summarizeContent(seed, 150),
      citation: best.citation,
      sourceId: best.sourceId,
      chunkId: best.id,
      evidence: summarizeContent(best.text, 160)
    } : null;
  }).filter(item => {
    if (!item || seen.has(item.claim)) return false;
    seen.add(item.claim);
    return true;
  }).slice(0, 6);
}

function buildGuideClaims(notebook, text) {
  const claimSeeds = extractClaimSentences(text);
  const fallbackSeeds = getNotebookChunks(notebook)
    .sort((a, b) => String(b.text || '').length - String(a.text || '').length)
    .map(chunk => summarizeContent(chunk.text, 180));
  const seeds = (claimSeeds.length ? claimSeeds : fallbackSeeds).slice(0, 10);
  return seeds.map(claim => {
    const citation = findBestCitation(notebook, claim);
    return {
      claim: summarizeContent(claim, 180),
      citation: citation?.citation || '',
      sourceId: citation?.sourceId || '',
      chunkId: citation?.id || ''
    };
  });
}

function estimateAnswerConfidence(question, hits, notebook) {
  const sourceCount = new Set(hits.map(hit => hit.sourceId)).size;
  const topScore = hits[0]?.score || 0;
  const questionTerms = new Set(tokenize(question));
  const matchedTerms = new Set(hits.flatMap(hit => tokenize(hit.text)).filter(term => questionTerms.has(term)));
  const termCoverage = questionTerms.size ? matchedTerms.size / questionTerms.size : 0;
  const sourceBonus = Math.min(sourceCount / Math.max((notebook.sources || []).length, 1), 1);
  const score = Math.round(Math.min(100, topScore * 6 + termCoverage * 35 + sourceBonus * 20));
  return {
    score,
    label: score >= 72 ? '高' : score >= 45 ? '中' : '低',
    reasons: [
      `命中 ${hits.length} 个片段`,
      `覆盖 ${sourceCount} 个 Source`,
      `问题关键词覆盖率 ${Math.round(termCoverage * 100)}%`
    ]
  };
}

function analyzeNotebookQuality(notebook) {
  const sources = notebook.sources || [];
  const chunks = getNotebookChunks(notebook);
  const warnings = [];
  if (!sources.length) warnings.push('还没有 Source。');
  if (sources.length === 1) warnings.push('只有 1 个 Source，跨资料对比能力有限。');
  if (chunks.length < 6) warnings.push('可检索片段偏少，复杂问题可能证据不足。');
  if (sources.some(source => source.importHealth?.score < 70)) warnings.push('部分文件导入质量偏低，建议检查 OCR 或原文格式。');
  return {
    sourceCount: sources.length,
    chunkCount: chunks.length,
    averageImportScore: Math.round(sources.reduce((sum, source) => sum + (source.importHealth?.score || 80), 0) / Math.max(sources.length, 1)),
    warnings,
    readiness: warnings.length <= 1 ? 'ready' : warnings.length <= 3 ? 'usable' : 'weak'
  };
}

function extractKeywords(text) {
  const words = tokenize(text);
  const count = new Map();
  words.forEach(word => {
    if (!STOP_WORDS.has(word) && word.length > 1) count.set(word, (count.get(word) || 0) + 1);
  });
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([word]) => word);
}

function tokenize(text) {
  const source = String(text || '').toLowerCase();
  const latin = source.match(/[a-z][a-z0-9_-]{2,}/g) || [];
  const chinese = source.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
  const grams = [];
  chinese.forEach(word => {
    if (word.length <= 4) {
      grams.push(word);
      return;
    }
    for (let i = 0; i < word.length - 1; i += 1) grams.push(word.slice(i, i + 2));
    for (let i = 0; i < word.length - 2; i += 1) grams.push(word.slice(i, i + 3));
  });
  return [...latin, ...chinese, ...grams].filter(Boolean);
}

function buildTimeline(text) {
  const dates = String(text || '').match(/\d{4}年|\d{4}-\d{1,2}-\d{1,2}|第[一二三四五六七八九十\d]+章|第[一二三四五六七八九十\d]+节/g) || [];
  return [...new Set(dates)].slice(0, 10).map(item => ({ label: item, note: '资料中出现的重要节点' }));
}

function compareSources(sources) {
  if (sources.length < 2) {
    return [{ title: '资料对比', content: '至少添加 2 个 Source 后，可以生成共同主题、差异点和冲突观点。' }];
  }
  const keywordSets = sources.map(source => new Set(extractKeywords(source.content).slice(0, 30)));
  const common = [...keywordSets[0]].filter(word => keywordSets.slice(1).every(set => set.has(word))).slice(0, 8);
  return [
    { title: '共同主题', content: common.join('、') || '暂无明显共同主题' },
    { title: '差异线索', content: sources.map(source => `${source.title}：${extractKeywords(source.content).slice(0, 5).join('、')}`).join('\n') }
  ];
}

function buildSourceMatrix(sources, concepts) {
  return sources.slice(0, 8).map(source => ({
    sourceId: source.id,
    title: source.title,
    type: source.type,
    concepts: concepts.filter(concept => source.content.includes(concept)).slice(0, 6),
    summary: summarizeContent(source.content, 150)
  }));
}

function buildBriefingDoc(notebook, guide, concepts) {
  return {
    title: `${notebook.title} Briefing Doc`,
    overview: guide.summary,
    takeaways: concepts.slice(0, 6).map(item => `掌握「${item}」的定义、例子和易错点。`),
    nextActions: [
      '先读 Source Guide 的摘要和关键概念。',
      '点击引用回到原文片段核对。',
      '用闪卡闭卷复述，再做测验暴露薄弱点。'
    ]
  };
}

function buildMindMapBranches(notebook, guide, concepts, chunks) {
  const sourceCount = Math.max((notebook.sources || []).length, 1);

  // 策略1：检测文档结构（标题/章节），按文档自身逻辑组织
  const structuredSections = detectDocumentSections(chunks);
  if (structuredSections.length >= 3) {
    return structuredSections.slice(0, 8).map((section, index) => {
      const keyPoints = extractKeyPoints(section.chunks, 4);
      const evidence = section.chunks.slice(0, 3).map(hit => ({
        citation: hit.citation,
        sourceId: hit.sourceId,
        chunkId: hit.id,
        sourceTitle: hit.sourceTitle,
        text: summarizeContent(hit.text, 130),
        score: hit.score || 1
      }));
      const sourceTitles = [...new Set(section.chunks.map(c => c.sourceTitle).filter(Boolean))];
      const coverage = Math.round((sourceTitles.length / sourceCount) * 100);
      return {
        id: `b${index + 1}`,
        title: section.title,
        role: index === 0 ? '核心主干' : index < 3 ? '关键支撑' : '扩展分支',
        priority: evidence.length >= 3 || coverage >= 50 ? '高' : evidence.length >= 1 ? '中' : '待补充',
        coverage,
        summary: section.summary || summarizeContent(section.chunks[0]?.text || '', 180),
        sourceTitles,
        relatedConcepts: keyPoints.map(point => ({
          label: point.label,
          reason: point.reason,
          citation: point.citation
        })),
        evidence,
        questions: [
          `“${section.title}”的核心观点是什么？`,
          `“${section.title}”包含哪些子要点？`,
          keyPoints[0] ? `如何理解"${keyPoints[0].label}"？` : `哪些证据支持"${section.title}"？`
        ]
      };
    });
  }

  // 策略2：用知识点作为分支标题（从全文提取真正的术语）
  const topConcepts = extractKeyPoints(chunks, 8);
  if (topConcepts.length >= 3) {
    return topConcepts.slice(0, 8).map((concept, index) => {
      // 找包含这个知识点的段落作为证据
      const hits = chunks
        .filter(chunk => (chunk.text || '').includes(concept.label))
        .slice(0, 4);
      const evidence = hits.map(hit => ({
        citation: hit.citation,
        sourceId: hit.sourceId,
        chunkId: hit.id,
        sourceTitle: hit.sourceTitle,
        text: summarizeContent(hit.text, 130),
        score: hit.score || 1
      }));
      const sourceTitles = [...new Set(hits.map(hit => hit.sourceTitle).filter(Boolean))];
      const coverage = Math.round((sourceTitles.length / sourceCount) * 100);

      // 找相关的其他知识点（同段出现的）
      const relatedChunks = hits.length > 0 ? hits : chunks.slice(0, 5);
      const relatedPoints = extractKeyPoints(relatedChunks, 4)
        .filter(p => p.label !== concept.label)
        .slice(0, 4);

      return {
        id: `b${index + 1}`,
        title: concept.label,
        role: index === 0 ? '核心主干' : index < 3 ? '关键支撑' : '扩展分支',
        priority: evidence.length >= 3 || coverage >= 50 ? '高' : evidence.length >= 1 ? '中' : '待补充',
        coverage,
        summary: concept.context || summarizeContent(evidence[0]?.text || concept.label, 180),
        sourceTitles,
        relatedConcepts: relatedPoints.map(point => ({
          label: point.label,
          reason: point.reason,
          citation: point.citation
        })),
        evidence,
        questions: [
          `“${concept.label}”的定义是什么？`,
          `“${concept.label}”的物理意义是什么？`,
          relatedPoints[0] ? `“${concept.label}”和"${relatedPoints[0].label}"有什么关系？` : `哪些证据支持"${concept.label}"？`
        ]
      };
    });
  }

  // 策略3降级：用关键词（仅当上面两种都失败时）
  const fallbackConcepts = concepts.length ? concepts : (notebook.sources || []).map(source => source.title).slice(0, 8);
  return fallbackConcepts.slice(0, 8).map((concept, index) => {
    const hits = scoreItems(chunks, concept, chunk => `${chunk.sourceTitle} ${chunk.label} ${chunk.text}`).slice(0, 4);
    const sourceTitles = [...new Set(hits.map(hit => hit.sourceTitle).filter(Boolean))];
    const evidence = hits.map(hit => ({
      citation: hit.citation,
      sourceId: hit.sourceId,
      chunkId: hit.id,
      sourceTitle: hit.sourceTitle,
      text: summarizeContent(hit.text, 130),
      score: hit.score
    }));
    const coverage = Math.round((sourceTitles.length / sourceCount) * 100);
    return {
      id: `b${index + 1}`,
      title: concept,
      role: index === 0 ? '核心主干' : index < 3 ? '关键支撑' : '扩展分支',
      priority: evidence.length >= 3 || coverage >= 50 ? '高' : evidence.length >= 1 ? '中' : '待补充',
      coverage,
      summary: summarizeContent(evidence[0]?.text || guide.summary || concept, 180),
      sourceTitles,
      relatedConcepts: [],
      evidence,
      questions: [`"${concept}"在这份资料中的定义是什么？`]
    };
  });
}

// 检测文档结构：识别标题/章节/小节
function detectDocumentSections(chunks) {
  // 策略 A：检测 PPT 转 PDF 的模式
  // PPT 转 PDF 的特征：每页都有重复的课程标题（如"第 5.4 节：麦克斯韦方程组"）
  // 真正的章节标记是每页的主题词（如"位移电流"、"麦克斯韦方程组"），通常跟在课程标题后面
  const pptSections = detectPptPdfSections(chunks);
  if (pptSections.length >= 3) {
    // 检查是否有真正有意义的章节标题
    const hasMeaningfulSections = pptSections.some(s => {
      const title = s.title;
      if (title.length < 2) return false;
      if (/^第[\d一二三四五六七八九十百千]+[节章节部分]/.test(title)) return false;
      if (/参与式学习|前测|后测|目标|导言|总结/.test(title)) return false;
      const meaningfulTerms = ['定理', '定律', '方程', '电流', '电场', '磁场', '原理', '假说', '效应', '矢量', '通量'];
      return meaningfulTerms.some(t => title.includes(t)) || title.length >= 4;
    });
    if (hasMeaningfulSections) {
      return pptSections;
    }
  }

  // 策略 A+：直接用提取的知识点作为章节（如果检测不到好的结构）
  const keyPoints = extractKeyPoints(chunks, 6);
  if (keyPoints.length >= 3) {
    return keyPoints.map((point, idx) => ({
      title: point.label,
      chunks: chunks.filter(c => (c.text || '').includes(point.label)).slice(0, 5),
      summary: point.context || ''
    }));
  }

  // 策略 B：常规标题检测
  const headingPatterns = [
    /^第[一二三四五六七八九十百千\d]+[章节部分篇]/,  // 第一章、第3节
    /^[一二三四五六七八九十]+[、.．]/,               // 一、二、
    /^[\d]+[.．、]\s*\S/,                             // 1. 2、 3．
    /^Chapter\s+\d+/i,                                // Chapter 1
    /^[IVXLC]+[.．、]/,                               // IV.
    /^#{1,4}\s+/,                                      // Markdown 标题
    /^\[[\dA-Za-z\u4e00-\u9fa5]+\]/,                  // [标题]
  ];

  const sections = [];
  let currentSection = null;

  chunks.forEach(chunk => {
    const lines = chunk.text.split('\n').map(l => l.trim()).filter(Boolean);
    const firstLine = lines[0] || '';
    const isHeading = firstLine.length <= 40 && headingPatterns.some(p => p.test(firstLine));

    if (isHeading) {
      if (currentSection && currentSection.chunks.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        title: firstLine.replace(/^#{1,4}\s*/, '').replace(/^[\[【]/, '').replace(/[\]】]$/, '').trim(),
        chunks: [chunk],
        summary: lines.slice(1, 3).join(' ')
      };
    } else if (currentSection) {
      currentSection.chunks.push(chunk);
    } else {
      currentSection = {
        title: '引言/概述',
        chunks: [chunk],
        summary: summarizeContent(chunk.text, 150)
      };
    }
  });

  if (currentSection && currentSection.chunks.length > 0) {
    sections.push(currentSection);
  }

  // 过滤掉无效章节
  const filtered = sections.filter(s => 
    s.chunks.length >= 1 && 
    s.title.length > 1 &&
    !/参与式学习|前测|后测|目标|导言|总结/.test(s.title)
  );

  // 如果过滤后太少，降级到知识点
  if (filtered.length < 3 && keyPoints.length >= 3) {
    return keyPoints.map((point, idx) => ({
      title: point.label,
      chunks: chunks.filter(c => (c.text || '').includes(point.label)).slice(0, 5),
      summary: point.context || ''
    }));
  }

  return filtered;
}

// 检测 PPT 转 PDF 的章节结构
function detectPptPdfSections(chunks) {
  // 收集所有文本行，寻找 PPT 模式
  const allLines = [];
  chunks.forEach(chunk => {
    const lines = chunk.text.split('\n').map(l => l.trim()).filter(Boolean);
    allLines.push(...lines);
  });

  // 检测 PPT 模式：是否有重复的课程标题行
  const lineCounts = {};
  allLines.forEach(line => {
    if (line.length >= 5 && line.length <= 50) {
      lineCounts[line] = (lineCounts[line] || 0) + 1;
    }
  });

  // 找出重复出现 3 次以上的行（很可能是 PPT 每页的标题）
  const repeatedLines = Object.entries(lineCounts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  if (repeatedLines.length === 0) {
    return []; // 不是 PPT 模式
  }

  // 课程标题（重复最多的行）
  const courseTitle = repeatedLines[0][0];

  // 找出主题标记行：跟在课程标题后面、出现多次、不是页码的行
  const topicMarkers = new Set();
  repeatedLines.forEach(([line, count]) => {
    if (line !== courseTitle &&
        !/^\d+$/.test(line) &&  // 不是纯数字（页码）
        !/参与式学习|前测|后测|目标|导言|总结/.test(line) &&  // 不是通用标记
        line.length >= 2 && line.length <= 30) {
      topicMarkers.add(line);
    }
  });

  // 也检测"导言"部分的标记
  const introMarkers = ['导言', '引言', '前言', '概述'];
  introMarkers.forEach(m => {
    if (allLines.some(l => l.includes(m))) {
      topicMarkers.add(m);
    }
  });

  if (topicMarkers.size === 0) {
    return [];
  }

  // 按主题标记分组段落
  const sections = [];
  let currentTopic = null;
  let currentChunks = [];

  chunks.forEach(chunk => {
    const lines = chunk.text.split('\n').map(l => l.trim()).filter(Boolean);

    // 检查这个段落属于哪个主题
    let detectedTopic = null;
    for (const line of lines) {
      // 跳过课程标题行
      if (line === courseTitle) continue;
      // 检查是否是主题标记
      for (const marker of topicMarkers) {
        if (line === marker || line.startsWith(marker)) {
          detectedTopic = marker;
          break;
        }
      }
      if (detectedTopic) break;
    }

    if (detectedTopic && detectedTopic !== currentTopic) {
      // 主题切换
      if (currentTopic && currentChunks.length > 0) {
        sections.push({
          title: currentTopic,
          chunks: currentChunks,
          summary: summarizeContent(currentChunks[0]?.text || '', 150)
        });
      }
      currentTopic = detectedTopic;
      currentChunks = [chunk];
    } else {
      currentChunks.push(chunk);
    }
  });

  // 最后一个主题
  if (currentTopic && currentChunks.length > 0) {
    sections.push({
      title: currentTopic,
      chunks: currentChunks,
      summary: summarizeContent(currentChunks[0]?.text || '', 150)
    });
  }

  return sections;
}

// 从一组段落中提取关键要点（真正的知识点，不是句子碎片）
function extractKeyPoints(chunks, maxCount = 4) {
  const candidates = new Map(); // term -> { freq, citations, context, reason }

  // 策略 1：提取被定义的术语
  // 模式："X称为Y", "X叫做Y", "X叫做Y", "X是指Y", "X定义为Y"
  const defPatterns = [
    { regex: /([\u4e00-\u9fa5A-Za-z]{2,10})(?:称为|叫做|叫作|定义为)/g, reason: '定义' },
    { regex: /(?:称为|叫做|叫作|定义为|定义是|是指|指的是)([\u4e00-\u9fa5A-Za-z]{2,10})/g, reason: '定义' },
    // "把X叫做Y" / "将X称为Y"
    { regex: /(?:把|将)([\u4e00-\u9fa5A-Za-z]{2,10})(?:叫做|称为|叫作)/g, reason: '定义' },
  ];

  for (const chunk of chunks) {
    const text = chunk.text || '';
    for (const { regex, reason } of defPatterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const term = match[1].trim();
        if (term.length < 2 || term.length > 10) continue;
        if (isStopTerm(term)) continue;
        addCandidate(candidates, term, chunk, reason, text);
      }
    }
  }

  // 策略 2：提取带后缀的学术术语
  // 模式："X定律", "X定理", "X方程", "X效应", "X常数", "X原理"
  const suffixPatterns = [
    { regex: /([\u4e00-\u9fa5]{2,8})(?:定律|定理|方程|方程组|效应|常数|原理|法则|假说|条件|关系)/g, reason: '定律' },
    { regex: /([\u4e00-\u9fa5]{2,6})(?:电流|电场|磁场|电势|电容|电感|通量|密度|强度|系数)/g, reason: '概念' },
    { regex: /([\u4e00-\u9fa5]{2,6})(?:定理|理论|公式|表达式|边界条件)/g, reason: '概念' },
  ];

  for (const chunk of chunks) {
    const text = chunk.text || '';
    for (const { regex, reason } of suffixPatterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const term = match[0].trim(); // 包含后缀的完整术语
        if (term.length < 3 || term.length > 12) continue;
        if (isStopTerm(term)) continue;
        addCandidate(candidates, term, chunk, reason, text);
      }
    }
  }

  // 策略 3：提取列举项
  // 模式："（1）X", "（2）Y", "1. X", "2. Y"
  const listPatterns = [
    { regex: /(?:（(\d+)）|(\d+)[.．、])\s*([\u4e00-\u9fa5A-Za-z]{2,10})/g, reason: '要点' },
  ];

  for (const chunk of chunks) {
    const text = chunk.text || '';
    for (const { regex, reason } of listPatterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const term = match[3].trim();
        if (term.length < 2 || term.length > 10) continue;
        if (isStopTerm(term)) continue;
        addCandidate(candidates, term, chunk, reason, text);
      }
    }
  }

  // 策略 4：高频术语提取（N-gram 频率分析）
  // 对每个段落，提取 2-6 字符的中文 N-gram，统计频率
  const ngramStats = new Map();
  for (const chunk of chunks) {
    const text = chunk.text || '';
    // 只在中文连续序列中提取 N-gram
    const chineseSegments = text.match(/[\u4e00-\u9fa5]{4,}/g) || [];
    for (const seg of chineseSegments) {
      for (let n = 2; n <= 6; n++) {
        for (let i = 0; i <= seg.length - n; i++) {
          const ngram = seg.slice(i, i + n);
          if (isStopTerm(ngram)) continue;
          ngramStats.set(ngram, (ngramStats.get(ngram) || 0) + 1);
        }
      }
    }
  }

  // 把高频 N-gram 加入候选（频率 >= 3）
  for (const [term, freq] of ngramStats) {
    if (freq < 3) continue;
    if (candidates.has(term)) continue;
    // 找包含这个 N-gram 的段落
    for (const chunk of chunks) {
      if ((chunk.text || '').includes(term)) {
        addCandidate(candidates, term, chunk, '高频概念', chunk.text);
        break;
      }
    }
  }

  // 步骤 5：排序和去重
  const sorted = Array.from(candidates.values()).sort((a, b) => {
    // 优先级：定义 > 定律 > 概念 > 要点 > 高频概念
    const priority = { '定义': 5, '定律': 4, '概念': 3, '要点': 2, '高频概念': 1 };
    const pa = priority[a.reason] || 0;
    const pb = priority[b.reason] || 0;
    if (pa !== pb) return pb - pa;
    return b.freq - a.freq;
  });

  // 去重：移除是已选术语子串的项
  const selected = [];
  for (const item of sorted) {
    if (selected.length >= maxCount) break;
    const isSubstring = selected.some(s =>
      (s.term.includes(item.term) && s.term !== item.term) ||
      (item.term.includes(s.term) && s.term !== item.term && s.term.length >= item.term.length)
    );
    if (isSubstring) continue;
    // 避免选入太相似的术语
    const isSimilar = selected.some(s => {
      const overlap = getOverlap(s.term, item.term);
      return overlap > 0.7;
    });
    if (isSimilar) continue;
    selected.push(item);
  }

  return selected.map(item => ({
    label: item.term,
    reason: item.reason,
    citation: item.citations[0] || '',
    context: item.context || ''
  }));
}

function addCandidate(map, term, chunk, reason, fullText) {
  if (!map.has(term)) {
    // 找包含这个术语的句子作为上下文
    let context = '';
    const idx = fullText.indexOf(term);
    if (idx !== -1) {
      const sStart = fullText.lastIndexOf('。', idx);
      const sEnd = fullText.indexOf('。', idx);
      const start = sStart === -1 ? 0 : sStart + 1;
      const end = sEnd === -1 ? fullText.length : sEnd + 1;
      context = fullText.slice(start, end).trim();
      if (context.length > 100) context = context.slice(0, 100) + '...';
    }
    map.set(term, { term, freq: 0, citations: [], context, reason });
  }
  const entry = map.get(term);
  entry.freq++;
  if (entry.citations.length < 2 && !entry.citations.includes(chunk.citation)) {
    entry.citations.push(chunk.citation);
  }
}

function getOverlap(a, b) {
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  return 0;
}

// 判断是否是停用词（太常见的词，不是知识点）
function isStopTerm(term) {
  if (STOP_TERMS.has(term)) return true;
  // 纯数字
  if (/^\d+$/.test(term)) return true;
  // 包含太多数字
  const digitRatio = (term.match(/\d/g) || []).length / term.length;
  if (digitRatio > 0.4) return true;
  return false;
}

// 停用术语表（不是知识点的常见词）
const STOP_TERMS = new Set([
  '我们', '你们', '他们', '它们', '这个', '那个', '这些', '那些', '什么', '怎么',
  '可以', '应该', '必须', '需要', '可能', '或者', '但是', '而且', '并且', '因此',
  '所以', '因为', '由于', '使得', '导致', '从而', '对于', '关于', '通过', '根据',
  '如图', '所示', '如下', '以上', '以下', '其中', '另外', '此外', '同时', '然后',
  '一般', '通常', '主要', '大部分', '其他', '某些', '任何', '所有', '每个', '各个',
  '进行', '做出', '得到', '形成', '成为', '属于', '具有', '包含', '包括', '存在',
  '情况', '情况', '方面', '部分', '方面', '问题', '方法', '方式', '过程', '结果',
  '时候', '时间', '地方', '位置', '方向', '大小', '数量', '程度', '范围', '水平',
  '一样', '不同', '相同', '类似', '相似', '比如', '例如', '即', '也就是说',
  '参与式学习', '前测', '后测', '目标', '导言', '总结', '引言', '前言', '概述',
  '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十',
  '一定', '不一定', '总是', '永远', '从不', '经常', '偶尔', '有时',
  '一些', '一点', '一下', '一次', '一种', '一个', '这个', '那个',
  '的话', '的话', '来说', '来讲', '而言', '看来', '看来',
  '的话', '是的', '不是', '不要', '不能', '不会', '没有', '不用',
  '现在', '以前', '以后', '之后', '之前', '之间', '之内', '之外',
  '上面', '下面', '左边', '右边', '前面', '后面', '中间', '旁边',
  '今天', '昨天', '明天', '今年', '去年', '明年',
  '使用', '利用', '运用', '采用', '采取', '采纳',
  '说明', '解释', '描述', '表示', '表达', '体现', '反映',
  '发现', '发明', '创造', '制造', '生产', '产生',
  '增加', '减少', '增大', '减小', '增大', '降低', '升高',
  '开始', '结束', '完成', '继续', '停止', '暂停',
  '比较', '对比', '相对', '绝对', '近似', '约等',
  '实际', '理论', '实验', '测试', '检验', '验证',
  '注意', '需要', '要求', '满足', '符合', '遵循',
  '根据', '按照', '依据', '基于', '凭借',
  '以及', '还有', '还有', '此外', '另外',
  '可以', '能够', '能', '会', '要', '想', '该', '应',
  '的话', '的话', '的话', '的话', '的话',
  '进行', '加以', '予以', '给予',
  '使之', '使其', '让其', '令其',
  '由此', '据此', '据此', '据此',
  '由此', '由此', '由此',
  '对于', '关于', '至于', '由于',
  '通过', '经过', '经由', '借助',
  '根据', '依据', '基于', '凭借',
  '随着', '伴随', '跟着',
  '除了', '除非', '除开',
  '尽管', '虽然', '固然',
  '不管', '无论', '不论',
  '如果', '假如', '假设', '假定', '倘若',
  '只有', '只要', '唯有',
  '以便', '以免', '以免',
  '于是', '因此', '所以', '因而',
  '否则', '不然', '要不',
  '或者', '还是', '或是',
  '不但', '不仅', '不光',
  '既然', '既已', '既已',
  '即使', '即便', '就算',
  '与其', '宁肯', '宁愿',
  '因为', '由于', '鉴于',
  '为了', '为着',
  '把', '被', '让', '使', '给', '对', '跟', '和', '同', '与',
  '的', '了', '在', '是', '有', '和', '就', '不', '人', '都',
  '一', '上', '也', '很', '到', '说', '要', '去', '会', '着',
  '没有', '看', '好', '自己', '这', '那', '它', '他', '她',
  '从', '里', '边', '间', '前', '后', '头', '底', '顶', '旁',
  '中', '外', '内', '上', '下', '左', '右',
  '第', '第', '第',
  '等', '等等', '之类', '什么的',
  '的话', '的话', '的话',
  '的话', '的话', '的话',
  '参与式', '学习', '页', '节', '章',
]);

const ENGLISH_STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
  'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
  'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy',
  'did', 'man', 'men', 'put', 'say', 'she', 'too', 'use', 'any', 'ask',
  'bad', 'big', 'end', 'few', 'got', 'let', 'lot', 'own', 'run', 'set',
  'try', 'use', 'via', 'yet', 'yes', 'no', 'not', 'or', 'if', 'so',
  'as', 'at', 'be', 'by', 'do', 'go', 'he', 'in', 'is', 'it',
  'me', 'my', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we',
  'an', 'am', 'ax', 'if', 'oh', 'ok', 'on', 'or', 'so', 'to',
  'this', 'that', 'these', 'those', 'they', 'them', 'their', 'there',
  'what', 'when', 'where', 'which', 'while', 'with', 'without',
  'from', 'into', 'onto', 'upon', 'over', 'under', 'above', 'below',
  'between', 'through', 'during', 'before', 'after', 'since', 'until',
  'about', 'against', 'among', 'around', 'along', 'across', 'behind',
  'beyond', 'within', 'without', 'upon', 'toward', 'towards',
  'have', 'has', 'had', 'having', 'been', 'being', 'were', 'will',
  'would', 'could', 'should', 'shall', 'might', 'must', 'can',
  'than', 'then', 'such', 'some', 'any', 'each', 'every', 'all',
  'both', 'few', 'more', 'most', 'other', 'some', 'no', 'only',
  'same', 'very', 'just', 'also', 'too', 'quite', 'rather',
  'almost', 'enough', 'indeed', 'perhaps', 'maybe', 'probably',
  'certainly', 'definitely', 'possibly', 'likely', 'unlikely',
  'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
  'nonetheless', 'instead', 'otherwise', 'accordingly', 'consequently',
  'thus', 'hence', 'besides', 'meanwhile', 'afterward', 'afterwards',
  'forward', 'backward', 'upward', 'downward', 'inward', 'outward',
]);

// 按主题聚类段落
function clusterChunksByTopic(chunks, clusterCount) {
  if (chunks.length < clusterCount) {
    // 段落太少，每个段落自成一簇
    return chunks.map(chunk => ({
      title: summarizeContent(chunk.text, 20) || chunk.label,
      chunks: [chunk],
      summary: summarizeContent(chunk.text, 150)
    }));
  }

  // 计算每个段落的词频
  const chunkTokens = chunks.map(chunk => {
    const tokens = tokenize(chunk.text);
    const freq = {};
    tokens.forEach(t => { if (t.length >= 2 && !STOP_WORDS.has(t)) freq[t] = (freq[t] || 0) + 1; });
    return { chunk, freq, tokens };
  });

  // 用前 K 个高频词作为初始聚类中心
  const allTerms = {};
  chunkTokens.forEach(({ freq }) => {
    Object.entries(freq).forEach(([term, count]) => {
      allTerms[term] = (allTerms[term] || 0) + count;
    });
  });
  const topTerms = Object.entries(allTerms)
    .sort((a, b) => b[1] - a[1])
    .slice(0, clusterCount * 3)
    .map(([term]) => term);

  if (topTerms.length < clusterCount) {
    // 词汇太少，按段落顺序分组
    const groupSize = Math.ceil(chunks.length / clusterCount);
    const clusters = [];
    for (let i = 0; i < chunks.length; i += groupSize) {
      const group = chunks.slice(i, i + groupSize);
      clusters.push({
        title: extractSectionTitle(group) || `主题 ${clusters.length + 1}`,
        chunks: group,
        summary: summarizeContent(group[0]?.text || '', 150)
      });
    }
    return clusters;
  }

  // 为每个聚类中心分配一个主题词
  const centers = topTerms.slice(0, clusterCount);
  const clusters = centers.map(term => ({
    title: term,
    chunks: [],
    summary: ''
  }));

  // 把每个段落分配到最相似的聚类
  chunkTokens.forEach(({ chunk, freq }) => {
    let bestCluster = 0;
    let bestScore = 0;
    centers.forEach((term, idx) => {
      const score = freq[term] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestCluster = idx;
      }
    });
    if (bestScore > 0) {
      clusters[bestCluster].chunks.push(chunk);
    } else {
      // 没有匹配的，放到第一个聚类
      clusters[0].chunks.push(chunk);
    }
  });

  // 过滤空聚类，生成摘要
  return clusters
    .filter(c => c.chunks.length > 0)
    .map(c => ({
      title: c.title,
      chunks: c.chunks,
      summary: summarizeContent(c.chunks[0]?.text || '', 150)
    }));
}

// 从一组段落中提取一个合适的标题
function extractSectionTitle(chunks) {
  if (!chunks.length) return '';
  const firstText = chunks[0].text || '';
  const firstLine = firstText.split('\n')[0]?.trim();
  if (firstLine && firstLine.length <= 30) return firstLine;
  return summarizeContent(firstText, 20);
}

function flattenMindMapNodes(notebook, branches) {
  const nodes = [{ id: 'root', label: notebook.title, level: 0, type: 'root' }];
  branches.forEach(branch => {
    nodes.push({
      id: branch.id,
      label: branch.title,
      level: 1,
      type: 'branch',
      role: branch.role,
      priority: branch.priority,
      coverage: branch.coverage
    });
    branch.relatedConcepts.forEach((concept, index) => {
      nodes.push({
        id: `${branch.id}-c${index + 1}`,
        label: concept.label,
        level: 2,
        type: 'concept',
        citation: concept.citation
      });
    });
    branch.evidence.slice(0, 2).forEach((evidence, index) => {
      nodes.push({
        id: `${branch.id}-e${index + 1}`,
        label: evidence.citation || evidence.sourceTitle || '证据',
        level: 3,
        type: 'evidence',
        sourceId: evidence.sourceId,
        chunkId: evidence.chunkId
      });
    });
  });
  return nodes;
}

function flattenMindMapEdges(branches) {
  const edges = [];
  branches.forEach(branch => {
    edges.push({ from: 'root', to: branch.id, relation: branch.role });
    branch.relatedConcepts.forEach((_, index) => {
      edges.push({ from: branch.id, to: `${branch.id}-c${index + 1}`, relation: '相关概念' });
    });
    branch.evidence.slice(0, 2).forEach((_, index) => {
      edges.push({ from: branch.id, to: `${branch.id}-e${index + 1}`, relation: '证据' });
    });
  });
  return edges;
}

function buildMindMapInsights(notebook, branches) {
  const highPriority = branches.filter(branch => branch.priority === '高').map(branch => branch.title);
  const weakBranches = branches.filter(branch => !branch.evidence.length || branch.coverage < 25).map(branch => branch.title);
  const sourceSpread = branches
    .flatMap(branch => branch.sourceTitles)
    .reduce((acc, title) => {
      acc[title] = (acc[title] || 0) + 1;
      return acc;
    }, {});
  const strongestSource = Object.entries(sourceSpread).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  return [
    highPriority.length ? `优先掌握：${highPriority.slice(0, 4).join('、')}。` : '当前资料还没有形成足够强的高优先级主干。',
    strongestSource ? `证据最密集的 Source：${strongestSource}。` : '还需要更多 Source 才能比较证据分布。',
    weakBranches.length ? `需要补证据或追问：${weakBranches.slice(0, 4).join('、')}。` : '主要分支都有可回溯证据。'
  ];
}

function buildEvidenceTrail(branches) {
  return branches
    .flatMap(branch => branch.evidence.map(evidence => ({
      branch: branch.title,
      citation: evidence.citation,
      sourceId: evidence.sourceId,
      chunkId: evidence.chunkId,
      text: evidence.text
    })))
    .slice(0, 12);
}

function buildMindMapLearningPath(branches) {
  return branches.slice(0, 6).map((branch, index) => ({
    step: index + 1,
    title: branch.title,
    action: branch.priority === '待补充'
      ? '先补充资料或追问定义，再进入复习'
      : `先读证据，再回答：${branch.questions[0]}`,
    citation: branch.evidence[0]?.citation || ''
  }));
}

function buildSuggestedQuestions(concepts, notebook) {
  const base = (concepts || []).slice(0, 6).map(item => `「${item}」在这些资料里的作用是什么？`);
  return [
    ...base,
    `请把《${notebook.title}》整理成考试复习提纲。`,
    '这些 Source 之间有哪些共同观点和冲突点？',
    '请生成 5 张最适合复习的闪卡。'
  ].slice(0, 8);
}

function buildStudyGuide(concepts, notebook) {
  const names = concepts.length ? concepts.slice(0, 8) : (notebook.sources || []).map(source => source.title).slice(0, 5);
  return names.map((item, index) => `第 ${index + 1} 步：复习 ${item}，并从 Source 中摘出 1 个定义、1 个例子、1 个易错点。`);
}

function buildFaq(concepts, notebook) {
  return concepts.slice(0, 6).map(item => {
    const citation = findBestCitation(notebook, item);
    return {
      question: `${item} 的核心是什么？`,
      answer: citation
        ? `优先查看 ${citation.citation}，再把定义、适用场景和例子整理成卡片。`
        : `先在 Source 中搜索「${item}」，找到定义和例子。`,
      citation: citation?.citation || ''
    };
  });
}

function buildGaps(notebook) {
  const gaps = [];
  const sources = notebook.sources || [];
  if (!sources.length) gaps.push('还没有 Source，无法进行资料级问答。');
  if (sources.length === 1) gaps.push('只有 1 个 Source，多资料对比和冲突观点会比较弱。');
  if (!sources.some(source => /pdf|docx|pptx|xlsx|web|youtube|image/.test(source.type || ''))) {
    gaps.push('当前主要是文本粘贴，可以继续导入 PDF、PPT、表格、网页或图片。');
  }
  if (sources.some(source => source.type === 'youtube' && source.meta?.needsTranscript)) {
    gaps.push('部分 YouTube Source 没有公开字幕，需要补充转写文本。');
  }
  return gaps.length ? gaps : ['资料覆盖较完整，可以开始生成 Guide、测验和复习报告。'];
}

function buildConclusion(question, hits, concepts) {
  if (!hits.length) return '资料不足，建议先补充 Source 或改用更具体的问题。';
  const lead = summarizeContent(hits[0].text, 180);
  const conceptText = concepts.length ? `关键词集中在：${concepts.join('、')}。` : '';
  return `针对“${question}”，最相关的依据是：${lead} ${conceptText}`.trim();
}

function findBestCitation(notebook, query) {
  const hits = scoreItems(getNotebookChunks(notebook), query, chunk => `${chunk.sourceTitle} ${chunk.text}`);
  return hits[0] || null;
}

function groupBySource(items) {
  return items.reduce((acc, item) => {
    acc[item.sourceTitle] = acc[item.sourceTitle] || [];
    acc[item.sourceTitle].push(item);
    return acc;
  }, {});
}

function scoreItems(items, query, pickText) {
  const terms = tokenize(query);
  if (!terms.length) return items.slice(0, 12);
  const uniqueTerms = [...new Set(terms)];
  const queryText = String(query || '').toLowerCase();

  return items
    .map(item => {
      const raw = pickText(item) || '';
      const haystack = raw.toLowerCase();
      const hayTokens = tokenize(raw);
      const tf = new Map();
      hayTokens.forEach(token => tf.set(token, (tf.get(token) || 0) + 1));
      let score = 0;
      uniqueTerms.forEach(term => {
        if (haystack.includes(term)) score += 2;
        if (tf.has(term)) score += Math.min(tf.get(term), 6);
      });
      if (queryText && haystack.includes(queryText)) score += 8;
      if (item.sourceTitle && String(item.sourceTitle).toLowerCase().includes(queryText)) score += 4;
      return { ...item, score: Number(score.toFixed(2)) };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function flattenRelated(items) {
  return items.flatMap(item => {
    if (Array.isArray(item.Topics)) return flattenRelated(item.Topics);
    if (!item.Text) return [];
    return [{ title: item.Text.split(' - ')[0], snippet: item.Text, url: item.FirstURL || '' }];
  });
}

function parseTags(tags) {
  if (!tags) return [];
  return String(tags).split(/[,，\s]+/).map(tag => tag.trim()).filter(Boolean).slice(0, 10);
}

function summarizeContent(content, limit = 220) {
  const compact = cleanText(content, '').replace(/\s+/g, ' ').trim();
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function slugifyFileName(name) {
  return String(name || 'notebook')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'notebook';
}

function csvRows(rows) {
  return rows.map(row => row.map(value => `"${String(value || '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function htmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBriefingMarkdown(notebook) {
  const guide = notebook.guide || {};
  const artifacts = notebook.artifacts || {};
  const lines = [
    `# ${notebook.title}`,
    '',
    '## Briefing',
    guide.summary || '',
    '',
    '## Key Claims',
    ...(guide.claims || []).map(item => `- ${item.claim}${item.citation ? ` (${item.citation})` : ''}`),
    '',
    '## Mind Map Branches',
    ...((notebook.mindMap?.branches || []).map(branch => `- **${branch.title}** [${branch.priority || '中'}] ${branch.summary || ''}`)),
    '',
    '## Mastery Plan',
    ...((artifacts.masteryPlan || []).map(item => `${item.step}. ${item.concept}: ${item.action}${item.citation ? ` (${item.citation})` : ''}`)),
    '',
    '## Evidence Table',
    ...((artifacts.evidenceTable || []).map(item => `- ${item.concept}: ${item.claim}${item.citation ? ` (${item.citation})` : ''}`))
  ];
  return lines.join('\n');
}

function renderReportHtml(notebook) {
  const guide = notebook.guide || {};
  const artifacts = notebook.artifacts || {};
  const sections = artifacts.report?.sections || [];
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${htmlEscape(notebook.title)} Report</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;max-width:960px;margin:40px auto;line-height:1.7;color:#171717}section{border-top:1px solid #ddd;padding:18px 0}.cite{color:#666;font-size:13px}.card{border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0;background:#fafafa}</style></head>
<body>
<h1>${htmlEscape(notebook.title)}</h1>
<p>${htmlEscape(guide.summary || '')}</p>
${sections.map(section => `<section><h2>${htmlEscape(section.title)}</h2><p>${htmlEscape(section.content)}</p></section>`).join('')}
<section><h2>关键判断</h2>${(guide.claims || []).map(item => `<div class="card">${htmlEscape(item.claim)}<div class="cite">${htmlEscape(item.citation || '')}</div></div>`).join('')}</section>
<section><h2>证据表</h2>${(artifacts.evidenceTable || []).map(item => `<div class="card"><strong>${htmlEscape(item.concept)}</strong><br>${htmlEscape(item.claim)}<div class="cite">${htmlEscape(item.citation || '')}</div></div>`).join('')}</section>
</body></html>`;
}

function renderSlideDeckHtml(notebook) {
  const guide = notebook.guide || {};
  const video = notebook.videoOverview || {};
  const scenes = video.scenes || [];
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${htmlEscape(notebook.title)} Slides</title>
<style>body{margin:0;background:#111;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}.slide{width:1280px;height:720px;box-sizing:border-box;padding:72px;display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid #333}.slide h1,.slide h2{font-size:56px;margin:0 0 24px}.slide p{font-size:30px;line-height:1.55;max-width:980px}.cite{font-size:20px;color:#bbb;margin-top:28px}</style></head>
<body>
<section class="slide"><h1>${htmlEscape(notebook.title)}</h1><p>${htmlEscape(guide.summary || '')}</p></section>
${scenes.map(scene => `<section class="slide"><h2>${htmlEscape(scene.title)}</h2><p>${htmlEscape(scene.narration || scene.visual || '')}</p><div class="cite">${htmlEscape(scene.citation || '')}</div></section>`).join('')}
</body></html>`;
}

function touchNotebook(notebook) {
  notebook.updatedAt = now();
  notebook.guide = null;
  notebook.audioOverview = null;
  notebook.videoOverview = null;
  notebook.mindMap = null;
  notebook.artifacts = null;
}

function cleanKnowledge(items) {
  return items.filter(item => !isCorruptRecord(item)).map(item => ({
    ...item,
    title: cleanText(item.title, '未命名资料'),
    source: cleanText(item.source, ''),
    summary: cleanText(item.summary, ''),
    content: cleanText(item.content, ''),
    tags: Array.isArray(item.tags) ? item.tags.filter(tag => !isCorruptText(tag)) : []
  }));
}

function cleanNotebooks(notebooks) {
  return notebooks.filter(item => !isCorruptRecord(item)).map(notebook => ({
    ...notebook,
    title: cleanText(notebook.title, '新的 Notebook'),
    description: cleanText(notebook.description, ''),
    sources: cleanSources(notebook.sources || []),
    guide: cleanGuide(notebook.guide),
    audioOverview: cleanAudio(notebook.audioOverview),
    videoOverview: cleanVideo(notebook.videoOverview),
    mindMap: cleanMindMap(notebook.mindMap),
    artifacts: notebook.artifacts || null
  }));
}

function cleanSources(sources) {
  return sources.filter(item => !isCorruptRecord(item)).map(source => ({
    ...source,
    title: cleanText(source.title, '未命名 Source'),
    origin: cleanText(source.origin, ''),
    summary: cleanText(source.summary, ''),
    content: cleanText(source.content, ''),
    chunks: (source.chunks || []).filter(chunk => !isCorruptText(chunk.text)).map(chunk => ({
      ...chunk,
      label: cleanText(chunk.label, `段落 ${chunk.index || 1}`),
      text: cleanText(chunk.text, '')
    }))
  }));
}

function cleanGuide(guide) {
  if (!guide || isCorruptRecord(guide)) return null;
  return {
    ...guide,
    summary: cleanText(guide.summary, ''),
    keyConcepts: (guide.keyConcepts || []).filter(item => !isCorruptText(item)).map(item => cleanText(item, '')),
    suggestedQuestions: (guide.suggestedQuestions || []).filter(item => !isCorruptText(item)),
    studyGuide: (guide.studyGuide || []).filter(item => !isCorruptText(item)),
    faq: (guide.faq || []).filter(item => !isCorruptRecord(item)),
    sourceBriefs: guide.sourceBriefs || [],
    timeline: guide.timeline || [],
    gaps: guide.gaps || []
  };
}

function cleanAudio(audio) {
  if (!audio || isCorruptRecord(audio)) return null;
  return {
    ...audio,
    title: cleanText(audio.title, '中文双人讲解'),
    script: (audio.script || []).filter(line => !isCorruptText(line)).map(line => cleanText(line, '')),
    chapters: audio.chapters || []
  };
}

function cleanVideo(video) {
  if (!video || isCorruptRecord(video)) return null;
  return {
    ...video,
    title: cleanText(video.title, '视频概览脚本'),
    scenes: (video.scenes || []).filter(scene => !isCorruptRecord(scene))
  };
}

function cleanMindMap(mindMap) {
  if (!mindMap) return null;
  return {
    ...mindMap,
    nodes: (mindMap.nodes || []).filter(node => !isCorruptText(node.label)).map(node => ({ ...node, label: cleanText(node.label, '节点') })),
    edges: mindMap.edges || []
  };
}

function cleanText(value, fallback = '') {
  const text = String(value || '').trim();
  return isCorruptText(text) ? fallback : text;
}

function isCorruptRecord(record) {
  const text = `${record?.title || ''} ${record?.source || ''} ${record?.content || ''} ${record?.summary || ''} ${record?.question || ''} ${record?.answer || ''}`;
  return isCorruptText(text);
}

function isCorruptText(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  const questionMarks = (text.match(/\?/g) || []).length;
  const mojibakeHits = (text.match(/鏂|扮|殑|榛|璧|勬|枡|涓|绗|娈|惤|鐗|寰|鍊||€|俙/g) || []).length;
  return text.includes('??') ||
    text.includes('�') ||
    (questionMarks >= 6 && questionMarks / Math.max(text.length, 1) > 0.28) ||
    (mojibakeHits >= 3 && mojibakeHits / Math.max(text.length, 1) > 0.08);
}

function throwStatus(message, status) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

module.exports = {
  getWorkspace,
  saveProfile,
  addKnowledge,
  searchKnowledge,
  createNotebook,
  deleteNotebook,
  clearNotebookArtifact,
  addNotebookSource,
  updateNotebookSource,
  deleteNotebookSource,
  searchNotebookSources,
  answerNotebookSources,
  generateSourceGuide,
  generateAudioOverview,
  generateVideoOverview,
  generateMindMap,
  generateMindMapAsync,
  analyzeNotebookStructure,
  analyzeNotebookConcepts,
  generateStudioArtifacts,
  generateCompleteStudio,
  exportNotebookArtifact,
  saveSession,
  checkInFocus,
  webSearch
};
