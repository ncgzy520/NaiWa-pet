// 网站维护者专用：AES-256-GCM 加密保存大模型 API Key 工具（绝不以明文落盘）
const readline = require('readline');
const { encryptSecrets, loadSecrets, SECRET_FILE } = require('./secretManager');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, ans => resolve(ans.trim())));
}

(async () => {
  console.log('==============================================================');
  console.log('🔒 奶蛙后端密钥 AES-256-GCM 加密保险箱工具 (零明文存储)');
  console.log('提示：直接回车可跳过不需要修改的项。输入内容将使用 AES-256-GCM 加密写入密文文件。');
  console.log('==============================================================\n');

  const current = loadSecrets();

  const azureEndpoint = await ask('1. Azure OpenAI Endpoint (直接回车保持不变): ');
  const azureKey = await ask('2. Azure OpenAI API Key (直接回车保持不变): ');
  const azureDeploy = await ask('3. Azure OpenAI Deployment 名称 (默认 gpt-4o-mini): ');
  const deepseekKey = await ask('4. DeepSeek API Key (直接回车保持不变): ');
  const geminiKey = await ask('5. Google Gemini API Key (直接回车保持不变): ');

  const nextSecrets = {
    AZURE_OPENAI_ENDPOINT: azureEndpoint || current.AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_KEY: azureKey || current.AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_DEPLOYMENT: azureDeploy || current.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
    DEEPSEEK_API_KEY: deepseekKey || current.DEEPSEEK_API_KEY,
    GEMINI_API_KEY: geminiKey || current.GEMINI_API_KEY
  };

  encryptSecrets(nextSecrets);
  console.log(`\n✅ 密钥已通过 AES-256-GCM 硬件级加密保存至：${SECRET_FILE}`);
  console.log('🛡️ 磁盘上无任何明文 API Key，且该文件已被 .gitignore 排除，绝不会上传或被外部读取！');
  rl.close();
})();
