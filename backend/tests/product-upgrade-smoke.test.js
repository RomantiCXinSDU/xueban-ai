const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const xlsx = require('xlsx');

const rootDir = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const problemRoutes = fs.readFileSync(path.join(rootDir, 'backend', 'routes', 'problemRoutes.js'), 'utf8');
const productRoutes = fs.readFileSync(path.join(rootDir, 'backend', 'routes', 'productRoutes.js'), 'utf8');
const aiService = require('../services/aiService');
const productService = require('../services/productService');
const fileImportService = require('../services/fileImportService');

test('frontend exposes the simplified product workspace and Notebook flow', () => {
  assert.match(html, /AI 学习工作台/);
  assert.match(html, /你现在想做什么/);
  assert.match(html, /读资料并提问/);
  assert.match(html, /高级功能/);
  assert.match(html, /workflow-strip/);
  assert.match(html, /Paste text/);
  assert.match(html, /Studio：生成学习材料/);
  assert.match(html, /Chat/);
  assert.match(html, /Upload files/);
  assert.match(html, /Import link/);
  assert.match(html, /Source Guide/);
  assert.match(html, /Audio Overview/);
  assert.match(html, /Video Overview/);
  assert.match(html, /Study Tools/);
  assert.match(html, /source-reader/);
  assert.match(html, /function quickStartNotebook/);
  assert.match(html, /function quickNotebookPrompt/);
  assert.match(html, /function openCitation/);
  assert.match(html, /function generateAllStudioUI/);
  assert.match(html, /function generateVideoUI/);
  assert.match(html, /function startStudioJobUI/);
  assert.match(html, /function exportNotebookArtifactUI/);
  assert.match(html, /function playAudioOverviewUI/);
  assert.match(html, /speechSynthesis/);
  assert.match(html, /\.xlsx/);
  assert.match(html, /\.epub/);
  assert.match(html, /image\/\*/);
});

test('frontend still exposes provider presets and learning loop capabilities', () => {
  assert.match(html, /DeepSeek/);
  assert.match(html, /通义千问/);
  assert.match(html, /智谱 GLM/);
  assert.match(html, /Moonshot/);
  assert.match(html, /硅基流动/);
  assert.match(html, /会话历史/);
  assert.match(html, /提示词模板/);
  assert.match(html, /今日任务/);
  assert.match(html, /function resolveApiBase/);
  assert.match(html, /function saveConversationSnapshot/);
  assert.match(html, /function applyPromptTemplate/);
  assert.match(html, /function buildDailyTasks/);
  assert.match(html, /location\.port === '3000'/);
  assert.match(html, /splash-screen/);
  assert.match(html, /xueban-logo\.svg/);
});

test('ai service exposes practical study tool functions', () => {
  assert.strictEqual(typeof aiService.chat, 'function');
  assert.strictEqual(typeof aiService.summarize, 'function');
  assert.strictEqual(typeof aiService.generateQuiz, 'function');
  assert.strictEqual(typeof aiService.generateStrategy, 'function');
  assert.strictEqual(typeof aiService.generateStudyPlan, 'function');
});

test('product service stores profile, sessions and searchable knowledge', () => {
  const userId = `test-${Date.now()}`;
  productService.saveProfile(userId, { major: 'CS', exam: 'Final', weakPoints: ['linear algebra'] });
  productService.addKnowledge(userId, {
    title: 'Eigenvalue note',
    tags: 'math algebra',
    content: 'Eigenvectors stay on their span after a linear transformation.'
  });
  productService.saveSession(userId, { title: 'Matrix review', messages: [{ role: 'user', content: 'matrix' }] });
  productService.checkInFocus(userId, { minutes: 25, task: 'review note' });

  const workspace = productService.getWorkspace(userId);
  assert.strictEqual(workspace.profile.major, 'CS');
  assert.strictEqual(workspace.knowledge.length, 1);
  assert.strictEqual(workspace.sessions.length, 1);
  assert.strictEqual(workspace.focus.minutes, 25);
  assert.strictEqual(productService.searchKnowledge(userId, 'Eigenvectors').length, 1);
});

test('product service supports NotebookLM-style citations and Studio artifacts', () => {
  const userId = `notebook-${Date.now()}`;
  const created = productService.createNotebook(userId, { title: 'Linear Algebra Notebook' });
  const added = productService.addNotebookSource(userId, created.notebook.id, {
    title: 'Eigen notes',
    content: '特征值表示线性变换在某些方向上的伸缩比例。第1章讨论矩阵和向量空间。',
    sections: [{ label: '第 1 页', text: '特征值表示线性变换在某些方向上的伸缩比例。' }]
  });
  const hits = productService.searchNotebookSources(userId, created.notebook.id, '特征值');
  const answer = productService.answerNotebookSources(userId, created.notebook.id, '特征值是什么');
  const guide = productService.generateSourceGuide(userId, created.notebook.id);
  const audio = productService.generateAudioOverview(userId, created.notebook.id);
  const video = productService.generateVideoOverview(userId, created.notebook.id);
  const map = productService.generateMindMap(userId, created.notebook.id);
  const artifacts = productService.generateStudioArtifacts(userId, created.notebook.id);
  const complete = productService.generateCompleteStudio(userId, created.notebook.id);
  const exported = productService.exportNotebookArtifact(userId, created.notebook.id, 'briefing-md');

  assert.strictEqual(added.notebook.sources.length, 1);
  assert.ok(added.source.profile.concepts.length >= 1);
  assert.ok(added.source.outline.length >= 1);
  assert.ok(added.source.importHealth.score >= 35);
  assert.ok(hits.length >= 1);
  assert.match(hits[0].citation, /第 1 页/);
  assert.ok(answer.citations.length >= 1);
  assert.ok(answer.claimCitations.length >= 1);
  assert.ok(answer.confidence.score >= 0);
  assert.ok(answer.quality.sourceCount >= 1);
  assert.ok(guide.guide.keyConcepts.length >= 1);
  assert.ok(guide.guide.claims.length >= 1);
  assert.ok(guide.guide.quality.chunkCount >= 1);
  assert.ok(audio.audioOverview.script.length >= 3);
  assert.ok(audio.audioOverview.evidenceBeats.length >= 1);
  assert.ok(audio.audioOverview.interactivePrompts.length >= 1);
  assert.ok(video.videoOverview.scenes.length >= 3);
  assert.ok(video.videoOverview.visualAssets.length >= 1);
  assert.ok(video.videoOverview.exportPlan.length >= 1);
  assert.ok(map.mindMap.nodes.length >= 2);
  assert.ok(map.mindMap.branches.length >= 1);
  assert.ok(map.mindMap.insights.length >= 2);
  assert.ok(map.mindMap.evidenceTrail.length >= 1);
  assert.ok(map.mindMap.learningPath.length >= 1);
  assert.ok(artifacts.artifacts.report.sections.length >= 1);
  assert.ok(artifacts.artifacts.flashcards.length >= 1);
  assert.ok(artifacts.artifacts.quiz.length >= 1);
  assert.ok(artifacts.artifacts.masteryPlan.length >= 1);
  assert.ok(artifacts.artifacts.evidenceTable.length >= 1);
  assert.ok(artifacts.artifacts.exports.length >= 1);
  assert.ok(complete.videoOverview.scenes.length >= 1);
  assert.match(exported.body, /# Linear Algebra Notebook/);
  assert.match(exported.filename, /briefing\.md/);
});

test('problem routes expose auto single and multi photo analysis', () => {
  assert.match(problemRoutes, /photo-analyze/);
  assert.match(problemRoutes, /splitQuestionBlocks/);
  assert.match(problemRoutes, /classifyPhotoQuestion/);
});

test('product routes expose Notebook file, url, answer and video endpoints', () => {
  assert.match(productRoutes, /import-file/);
  assert.match(productRoutes, /import-url/);
  assert.match(productRoutes, /notebooks\/:id\/answer/);
  assert.match(productRoutes, /video-overview/);
  assert.match(productRoutes, /multer/);
  assert.match(productRoutes, /studio-job/);
  assert.match(productRoutes, /export\/:type/);
  assert.match(productRoutes, /jobs\/:jobId/);
});

test('file import service reads text uploads into sources', async () => {
  const parsed = await fileImportService.parseUploadedFile({
    originalname: 'note.md',
    mimetype: 'text/markdown',
    buffer: Buffer.from('# Note\nEigenvalue source text', 'utf8')
  });
  assert.strictEqual(parsed.type, 'md');
  assert.match(parsed.content, /Eigenvalue/);
  assert.strictEqual(parsed.sections[0].label, '段落 1');
});

test('file import service reads pdf uploads with the installed pdf parser', async () => {
  const parsed = await fileImportService.parseUploadedFile({
    originalname: 'note.pdf',
    mimetype: 'application/pdf',
    buffer: makePdfBuffer('Hello PDF source')
  });
  assert.strictEqual(parsed.type, 'pdf');
  assert.match(parsed.content, /Hello PDF source/);
});

test('file import service reads xlsx workbooks into structured sections', async () => {
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet([
    ['概念', '解释'],
    ['特征值', '线性变换在特定方向上的伸缩比例']
  ]);
  xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const parsed = await fileImportService.parseUploadedFile({
    originalname: 'table.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer
  });
  assert.strictEqual(parsed.type, 'xlsx');
  assert.match(parsed.content, /特征值/);
  assert.strictEqual(parsed.sections[0].label, '工作表：Sheet1');
});

function makePdfBuffer(text) {
  const escaped = String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  ];
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}
