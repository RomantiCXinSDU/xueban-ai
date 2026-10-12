const productService = require('../services/productService');
const fileImportService = require('../services/fileImportService');
const jobService = require('../services/jobService');

function userIdFrom(req) {
  return req.user?.userId || req.body?.userId || req.query?.userId || 'default';
}

exports.getWorkspace = (req, res) => {
  res.json({
    success: true,
    workspace: productService.getWorkspace(userIdFrom(req))
  });
};

exports.saveProfile = (req, res) => {
  res.json({
    success: true,
    workspace: productService.saveProfile(userIdFrom(req), req.body.profile || req.body)
  });
};

exports.addKnowledge = (req, res) => {
  try {
    const result = productService.addKnowledge(userIdFrom(req), req.body);
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.searchKnowledge = (req, res) => {
  res.json({
    success: true,
    results: productService.searchKnowledge(userIdFrom(req), req.body.query)
  });
};

exports.saveSession = (req, res) => {
  const result = productService.saveSession(userIdFrom(req), req.body);
  res.status(201).json({ success: true, ...result });
};

exports.checkInFocus = (req, res) => {
  res.json({
    success: true,
    workspace: productService.checkInFocus(userIdFrom(req), req.body)
  });
};

exports.webSearch = async (req, res) => {
  try {
    const result = await productService.webSearch(req.body.query);
    res.json({ success: true, result });
  } catch (error) {
    res.status(error.status || 502).json({ success: false, error: error.message });
  }
};

exports.createNotebook = (req, res) => {
  try {
    const result = productService.createNotebook(userIdFrom(req), req.body);
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.addNotebookSource = (req, res) => {
  try {
    const result = productService.addNotebookSource(userIdFrom(req), req.params.id, req.body);
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.importNotebookFile = async (req, res) => {
  try {
    const parsed = await fileImportService.parseUploadedFile(req.file);
    const result = productService.addNotebookSource(userIdFrom(req), req.params.id, {
      ...parsed,
      title: req.body.title || parsed.title,
      tags: req.body.tags || parsed.type,
      origin: parsed.origin || req.file.originalname
    });
    res.status(201).json({ success: true, parsed, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.importNotebookUrl = async (req, res) => {
  try {
    const parsed = await fileImportService.importWebPage(req.body.url);
    const result = productService.addNotebookSource(userIdFrom(req), req.params.id, {
      ...parsed,
      title: req.body.title || parsed.title,
      tags: req.body.tags || 'web'
    });
    res.status(201).json({ success: true, parsed, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.updateNotebookSource = (req, res) => {
  try {
    const result = productService.updateNotebookSource(userIdFrom(req), req.params.id, req.params.sourceId, req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.deleteNotebookSource = (req, res) => {
  try {
    const result = productService.deleteNotebookSource(userIdFrom(req), req.params.id, req.params.sourceId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.deleteNotebook = (req, res) => {
  try {
    const result = productService.deleteNotebook(userIdFrom(req), req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.clearNotebookArtifact = (req, res) => {
  try {
    const result = productService.clearNotebookArtifact(userIdFrom(req), req.params.id, req.params.type);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.searchNotebookSources = (req, res) => {
  res.json({
    success: true,
    results: productService.searchNotebookSources(userIdFrom(req), req.params.id, req.body.query)
  });
};

exports.answerNotebookSources = (req, res) => {
  try {
    const result = productService.answerNotebookSources(userIdFrom(req), req.params.id, req.body.question || req.body.query);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.generateSourceGuide = (req, res) => {
  try {
    const result = productService.generateSourceGuide(userIdFrom(req), req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.generateAudioOverview = (req, res) => {
  try {
    const result = productService.generateAudioOverview(userIdFrom(req), req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.generateVideoOverview = (req, res) => {
  try {
    const result = productService.generateVideoOverview(userIdFrom(req), req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.generateMindMap = async (req, res) => {
  try {
    const result = await productService.generateMindMapAsync(userIdFrom(req), req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.analyzeNotebook = (req, res) => {
  try {
    const stage = req.params.stage;
    let result;
    if (stage === 'structure') {
      result = productService.analyzeNotebookStructure(userIdFrom(req), req.params.id);
    } else if (stage === 'concepts') {
      result = productService.analyzeNotebookConcepts(userIdFrom(req), req.params.id);
    } else {
      return res.status(400).json({ success: false, error: '未知的分析阶段' });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.generateStudioArtifacts = (req, res) => {
  try {
    const result = productService.generateStudioArtifacts(userIdFrom(req), req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.startStudioJob = (req, res) => {
  try {
    const userId = userIdFrom(req);
    const notebookId = req.params.id;
    const steps = ['Source Guide', 'Audio Overview', 'Video Overview', 'Mind Map', 'Study Tools'];
    const job = jobService.createJob('Complete Studio', steps, async ({ setStep }) => {
      setStep(0, '生成 Source Guide');
      productService.generateSourceGuide(userId, notebookId);
      setStep(1, '生成 Audio Overview');
      productService.generateAudioOverview(userId, notebookId);
      setStep(2, '生成 Video Overview');
      productService.generateVideoOverview(userId, notebookId);
      setStep(3, '生成 Mind Map');
      await productService.generateMindMapAsync(userId, notebookId);
      setStep(4, '生成 Study Tools');
      const result = productService.generateStudioArtifacts(userId, notebookId);
      return { notebook: result.notebook, workspace: result.workspace };
    });
    res.status(202).json({ success: true, job });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.getJob = (req, res) => {
  const job = jobService.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'job not found' });
  return res.json({ success: true, job });
};

exports.exportNotebookArtifact = (req, res) => {
  try {
    const result = productService.exportNotebookArtifact(userIdFrom(req), req.params.id, req.params.type);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
    res.send(result.body);
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};
