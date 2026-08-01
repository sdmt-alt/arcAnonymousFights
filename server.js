const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const USER_AVATAR_UPLOAD_DIR = "useravatars";
const BATTLE_UPLOAD_DIR = "ab";
const JACKET_UPLOAD_DIR = "jackets";
const COLLECTION_JACKET_UPLOAD_DIR = "collectionjacket";
const TREASURE_CHEST_UPLOAD_DIR = "treasurechest";
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const CODES_FILE = path.join(DATA_DIR, "registration-codes.json");
const REQUESTS_FILE = path.join(DATA_DIR, "chart-name-requests.json");
const COLLECTIONS_FILE = path.join(DATA_DIR, "collections.json");
const SCHEDULES_FILE = path.join(DATA_DIR, "schedules.json");
const BATTLES_FILE = path.join(DATA_DIR, "battles.json");
const GROUPS_FILE = path.join(DATA_DIR, "mapper-groups.json");
const JACKETS_FILE = path.join(DATA_DIR, "jacket-collections.json");
const TREASURE_DROPS_FILE = path.join(DATA_DIR, "treasure-drops.json");
const TREASURE_CLAIMS_FILE = path.join(DATA_DIR, "treasure-claims.json");
const BGS_FILE = path.join(DATA_DIR, "backgrounds.json");
const MAX_BODY_SIZE = 25 * 1024 * 1024;
const MAX_CHART_ZIP_SIZE = 12.8 * 1024 * 1024;
const DAILY_CHART_SUBMISSION_LIMIT = 5;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";
const OPTIONAL_CHECK_KEYS = ["duration", "difficulty", "noEternal", "affTypeCheck", "aafAccNormalize"];

const sessions = new Map();
const treasureCooldowns = new Map();
const treasureClickWindows = new Map();

ensureStorage();

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    serveFile(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "服务器暂时无法处理请求" });
  }
});

server.listen(PORT, () => {
  console.log(`Competition result collector running at http://localhost:${PORT}`);
  console.log(`Preset admin: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
});

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(uploadPath(USER_AVATAR_UPLOAD_DIR), { recursive: true });
  fs.mkdirSync(uploadPath(BATTLE_UPLOAD_DIR), { recursive: true });
  fs.mkdirSync(uploadPath(JACKET_UPLOAD_DIR), { recursive: true });
  fs.mkdirSync(uploadPath(COLLECTION_JACKET_UPLOAD_DIR), { recursive: true });
  fs.mkdirSync(uploadPath(TREASURE_CHEST_UPLOAD_DIR), { recursive: true });
  ensureJsonFile(USERS_FILE, []);
  ensureJsonFile(SUBMISSIONS_FILE, []);
  ensureJsonFile(CODES_FILE, []);
  ensureJsonFile(REQUESTS_FILE, []);
  ensureJsonFile(COLLECTIONS_FILE, []);
  ensureJsonFile(SCHEDULES_FILE, []);
  ensureJsonFile(BATTLES_FILE, []);
  ensureJsonFile(GROUPS_FILE, []);
  ensureJsonFile(JACKETS_FILE, []);
  ensureJsonFile(TREASURE_DROPS_FILE, []);
  ensureJsonFile(TREASURE_CLAIMS_FILE, []);
  ensureJsonFile(BGS_FILE, []);
  ensureAdminUser();
  ensureTreasureDrops();
  migrateBattles();
  migrateSubmissionMetadata();
  migrateUploadLayout();
}

function ensureJsonFile(file, fallback) {
  if (!fs.existsSync(file)) writeJsonFile(file, fallback);
}

function ensureTreasureDrops() {
  const drops = readJsonFile(TREASURE_DROPS_FILE);
  if (drops.length) return;
  writeJsonFile(TREASURE_DROPS_FILE, [
    { id: crypto.randomUUID(), name: "今日掉落 A", probability: 50, assetUrl: "/assets/treasure-drop-a.svg", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: crypto.randomUUID(), name: "今日掉落 B", probability: 35, assetUrl: "/assets/treasure-drop-b.svg", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: crypto.randomUUID(), name: "今日掉落 C", probability: 15, assetUrl: "/assets/treasure-drop-c.svg", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ]);
}

function migrateBattles() {
  const battles = readJsonFile(BATTLES_FILE);
  const admin = readJsonFile(USERS_FILE).find((user) => user.role === "admin");
  let changed = false;
  const sortedBattles = battles
    .slice()
    .sort((a, b) => new Date(getBattleTimes(a).writingStartTime || a.startTime || 0).getTime() - new Date(getBattleTimes(b).writingStartTime || b.startTime || 0).getTime());
  const idMap = new Map();
  sortedBattles.forEach((battle, index) => {
    const nextId = String(index);
    if (battle.id !== nextId) {
      idMap.set(battle.id, nextId);
      battle.legacyId = battle.legacyId || battle.id;
      battle.id = nextId;
      changed = true;
    }
    battle.abId = index;
  });
  if (idMap.size) {
    const submissions = readJsonFile(SUBMISSIONS_FILE);
    let submissionsChanged = false;
    submissions.forEach((submission) => {
      if (idMap.has(submission.battleId)) {
        submission.battleId = idMap.get(submission.battleId);
        submissionsChanged = true;
      }
    });
    if (submissionsChanged) writeJsonFile(SUBMISSIONS_FILE, submissions);
  }
  battles.forEach((battle) => {
    if (!battle.writingStartTime || !battle.writingEndTime || !battle.packingStartTime || !battle.packingEndTime || !battle.snipingStartTime || !battle.snipingEndTime) {
      const writingStart = validDateValue(battle.startTime) || new Date().toISOString();
      const writingEnd = validDateValue(battle.endTime) || writingStart;
      const packingStart = writingEnd;
      const packingEnd = addDaysIso(packingStart, 1);
      const snipingStart = packingEnd;
      const snipingEnd = addDaysIso(snipingStart, 1);
      battle.writingStartTime = battle.writingStartTime || writingStart;
      battle.writingEndTime = battle.writingEndTime || writingEnd;
      battle.packingStartTime = battle.packingStartTime || packingStart;
      battle.packingEndTime = battle.packingEndTime || packingEnd;
      battle.snipingStartTime = battle.snipingStartTime || snipingStart;
      battle.snipingEndTime = battle.snipingEndTime || snipingEnd;
      battle.startTime = battle.writingStartTime;
      battle.endTime = battle.snipingEndTime;
      changed = true;
    }
    if (battle.packingStartTime !== battle.writingEndTime) {
      battle.packingStartTime = battle.writingEndTime;
      changed = true;
    }
    if (battle.snipingStartTime !== battle.packingEndTime) {
      battle.snipingStartTime = battle.packingEndTime;
      changed = true;
    }
    const packingMs = new Date(battle.packingEndTime).getTime() - new Date(battle.packingStartTime).getTime();
    const snipingMs = new Date(battle.snipingEndTime).getTime() - new Date(battle.snipingStartTime).getTime();
    if (!battle.phaseMigratedV2 && battle.writingEndTime && (packingMs !== 24 * 60 * 60 * 1000 || snipingMs !== 24 * 60 * 60 * 1000)) {
      battle.packingStartTime = battle.writingEndTime;
      battle.packingEndTime = addDaysIso(battle.packingStartTime, 1);
      battle.snipingStartTime = battle.packingEndTime;
      battle.snipingEndTime = addDaysIso(battle.snipingStartTime, 1);
      battle.endTime = battle.snipingEndTime;
      battle.phaseMigratedV2 = true;
      changed = true;
    }
    if (!battle.description && battle.note) {
      battle.description = battle.note;
      changed = true;
    }
    if (!Array.isArray(battle.hostUserIds) || !battle.hostUserIds.length) {
      battle.hostUserIds = [admin?.id || battle.createdBy].filter(Boolean);
      changed = true;
    }
    if (!battle.submissionLimits || typeof battle.submissionLimits !== "object") {
      battle.submissionLimits = { solo: "", collab: "", bonus: "" };
      changed = true;
    }
    if (!battle.optionalChecks || typeof battle.optionalChecks !== "object") {
      battle.optionalChecks = {
        duration: { enabled: false, min: "", max: "" },
        difficulty: { enabled: false, min: "", max: "" },
        noEternal: false,
        affTypeCheck: false,
        aafAccNormalize: false,
        affSyntax: buildAffSyntaxChecks({})
      };
      changed = true;
    }
    if (!battle.divisionMode) {
      battle.divisionMode = "standard";
      battle.customDivisions = [];
      changed = true;
    }
    const normalizedLocks = normalizeSettingLocks(battle.settingLocks);
    if (JSON.stringify(battle.settingLocks || {}) !== JSON.stringify(normalizedLocks)) {
      battle.settingLocks = normalizedLocks;
      changed = true;
    }
    const normalizedOptionalChecks = normalizeOptionalChecks(battle.optionalChecks);
    if (JSON.stringify(battle.optionalChecks || {}) !== JSON.stringify(normalizedOptionalChecks)) {
      battle.optionalChecks = normalizedOptionalChecks;
      changed = true;
    }
  });
  if (changed) writeJsonFile(BATTLES_FILE, battles);
}

function migrateSubmissionMetadata() {
  const submissions = readJsonFile(SUBMISSIONS_FILE);
  let changed = false;
  submissions.forEach((submission) => {
    if (!submission.savedFileName || (submission.songTitle && submission.songArtist && submission.thumbnailFileName)) return;
    const filePath = uploadPath(submission.savedFileName);
    if (!fs.existsSync(filePath)) return;
    try {
      const zipEntries = readZipEntries(fs.readFileSync(filePath));
      const metadata = extractChartMetadata(zipEntries, parseSonglistEntry(zipEntries));
      if (!metadata.ok || !metadata.thumbnailData.length) return;
      submission.songTitle = submission.songTitle || metadata.songTitle;
      submission.songArtist = submission.songArtist || metadata.songArtist;
      if (!submission.thumbnailFileName) {
        submission.thumbnailFileName = saveUpload(metadata.thumbnailData, `${submission.songId || "chart"}-base_256.jpg`, battleUploadDir(submission.battleId, "data"));
      }
      changed = true;
    } catch {
      // Keep legacy submissions usable even if their old zip cannot be parsed.
    }
  });
  if (changed) writeJsonFile(SUBMISSIONS_FILE, submissions);
}

function migrateUploadLayout() {
  const battles = readJsonFile(BATTLES_FILE);
  battles.forEach((battle) => ensureBattleUploadDirs(battle.id));
  let usersChanged = false;
  const users = readJsonFile(USERS_FILE);
  users.forEach((user) => {
    if (moveUploadField(user, "avatarFileName", USER_AVATAR_UPLOAD_DIR)) usersChanged = true;
  });
  if (usersChanged) writeJsonFile(USERS_FILE, users);

  let battlesChanged = false;
  battles.forEach((battle) => {
    if (moveUploadField(battle, "bannerFileName", battleUploadDir(battle.id, "banner"))) battlesChanged = true;
    if (moveUploadField(battle, "rulesFileName", battleUploadDir(battle.id, "data"))) battlesChanged = true;
  });
  if (battlesChanged) writeJsonFile(BATTLES_FILE, battles);

  let submissionsChanged = false;
  const submissions = readJsonFile(SUBMISSIONS_FILE);
  submissions.forEach((submission) => {
    if (moveUploadField(submission, "savedFileName", battleUploadDir(submission.battleId, "charts"))) submissionsChanged = true;
    if (moveUploadField(submission, "thumbnailFileName", battleUploadDir(submission.battleId, "data"))) submissionsChanged = true;
    if (moveUploadField(submission, "deletedFileName", battleUploadDir(submission.battleId, "charts"))) submissionsChanged = true;
  });
  if (submissionsChanged) writeJsonFile(SUBMISSIONS_FILE, submissions);

  let jacketsChanged = false;
  const jackets = readJsonFile(JACKETS_FILE);
  jackets.forEach((jacket) => {
    if (moveUploadField(jacket, "savedFileName", JACKET_UPLOAD_DIR)) jacketsChanged = true;
  });
  if (jacketsChanged) writeJsonFile(JACKETS_FILE, jackets);

  let collectionsChanged = false;
  const collections = readJsonFile(COLLECTIONS_FILE);
  collections.forEach((collection) => {
    if (moveUploadField(collection, "coverFileName", COLLECTION_JACKET_UPLOAD_DIR)) collectionsChanged = true;
  });
  if (collectionsChanged) writeJsonFile(COLLECTIONS_FILE, collections);

  let dropsChanged = false;
  const drops = readJsonFile(TREASURE_DROPS_FILE);
  drops.forEach((drop) => {
    if (moveUploadField(drop, "imageFileName", TREASURE_CHEST_UPLOAD_DIR)) dropsChanged = true;
  });
  if (dropsChanged) writeJsonFile(TREASURE_DROPS_FILE, drops);
}

function moveUploadField(record, field, relativeDir) {
  const current = record[field];
  if (!current || current.includes("/") || current.includes("\\")) return false;
  const source = path.join(UPLOAD_DIR, current);
  const targetRelative = path.posix.join(toPosixPath(relativeDir), current);
  const target = path.join(UPLOAD_DIR, ...targetRelative.split("/"));
  if (!fs.existsSync(source)) {
    record[field] = targetRelative;
    return true;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.renameSync(source, target);
  record[field] = targetRelative;
  return true;
}

function ensureAdminUser() {
  const users = readJsonFile(USERS_FILE);
  const existing = users.find((user) => user.username.toLowerCase() === ADMIN_USERNAME.toLowerCase());
  if (existing) {
    existing.role = "admin";
    existing.chartName = "管理员";
    writeJsonFile(USERS_FILE, users);
    return;
  }

  const salt = crypto.randomBytes(16).toString("hex");
  users.push({
    id: crypto.randomUUID(),
    username: ADMIN_USERNAME,
    chartName: "管理员",
    role: "admin",
    avatarFileName: "",
    bilibili: "",
    bio: "",
    salt,
    passwordHash: hashPassword(ADMIN_PASSWORD, salt),
    createdAt: new Date().toISOString()
  });
  writeJsonFile(USERS_FILE, users);
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/register") {
    const body = await readJson(req);
    const username = clean(body.username);
    const password = String(body.password || "");
    const chartName = clean(body.chartName);
    const registrationCode = clean(body.registrationCode);

    if (!username || !chartName || password.length < 6 || !registrationCode) {
      sendJson(res, 400, { error: "用户名、谱师名义、注册验证码不能为空，密码至少 6 位" });
      return;
    }

    const codes = readJsonFile(CODES_FILE);
    const code = codes.find((item) => item.code === registrationCode);
    if (!code || code.usedAt || code.invalidatedAt || new Date(code.expiresAt).getTime() <= Date.now()) {
      sendJson(res, 403, { error: "注册验证码无效或已过期" });
      return;
    }
    const users = readJsonFile(USERS_FILE);
    if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      sendJson(res, 409, { error: "该用户名已被注册" });
      return;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const user = {
      id: crypto.randomUUID(),
      username,
      chartName,
      role: "user",
      avatarFileName: "",
      bilibili: "",
      bio: "",
      salt,
      passwordHash: hashPassword(password, salt),
      createdAt: new Date().toISOString()
    };

    code.usedAt = new Date().toISOString();
    code.usedBy = user.id;
    users.push(user);
    writeJsonFile(USERS_FILE, users);
    writeJsonFile(CODES_FILE, codes);

    const token = createSession(user);
    sendJson(res, 201, { token, user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(req);
    const username = clean(body.username);
    const password = String(body.password || "");
    const user = readJsonFile(USERS_FILE).find((item) => item.username.toLowerCase() === username.toLowerCase());

    if (!user || user.passwordHash !== hashPassword(password, user.salt)) {
      sendJson(res, 401, { error: "用户名或密码不正确" });
      return;
    }

    const token = createSession(user);
    sendJson(res, 200, { token, user: publicUser(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    const groupId = clean(url.searchParams.get("groupId"));
    const users = readJsonFile(USERS_FILE)
      .filter((user) => (user.role || "user") === "user")
      .filter((user) => !groupId || (user.groupIds || []).includes(groupId))
      .sort((a, b) => (a.chartName || a.username).localeCompare(b.chartName || b.username, "zh-CN"))
      .map(publicUser);
    sendJson(res, 200, { users });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mapper-groups") {
    const groups = readJsonFile(GROUPS_FILE)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
      .map(publicGroup);
    sendJson(res, 200, { groups });
    return;
  }

  const myGroupMatch = url.pathname.match(/^\/api\/my\/mapper-groups\/([^/]+)$/);
  if (myGroupMatch && (req.method === "POST" || req.method === "DELETE")) {
    sendJson(res, 403, { error: "谱师组由管理员后台统一管理" });
    return;
  }
  const publicUserMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === "GET" && publicUserMatch) {
    const user = readJsonFile(USERS_FILE).find((item) => item.id === publicUserMatch[1] && item.role === "user");
    if (!user) {
      sendJson(res, 404, { error: "用户不存在" });
      return;
    }
    sendJson(res, 200, { user: publicUser(user), submissions: user.showSubmissions ? publicUserSubmissions(user.id) : [] });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/collections") {
    const collections = readJsonFile(COLLECTIONS_FILE)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicCollection);
    sendJson(res, 200, { collections });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/schedules") {
    const schedules = readJsonFile(SCHEDULES_FILE)
      .slice()
      .sort(sortTimelineItems)
      .map(publicSchedule);
    sendJson(res, 200, { schedules });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/battles") {
    const user = optionalUser(req);
    const battles = readJsonFile(BATTLES_FILE)
      .slice()
      .sort(sortTimelineItems)
      .map((battle) => publicBattle(battle, user));
    sendJson(res, 200, { battles });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/battles/active") {
    const user = optionalUser(req);
    const battles = readJsonFile(BATTLES_FILE)
      .filter((battle) => battlePhase(battle).kind === "writing")
      .filter((battle) => !user || canUserAccessBattle(user, battle))
      .sort((a, b) => getBattleTimes(a).writingEndTime.localeCompare(getBattleTimes(b).writingEndTime))
      .map((battle) => publicBattle(battle, user));
    sendJson(res, 200, { battles });
    return;
  }

  const publicBattleMatch = url.pathname.match(/^\/api\/battles\/([^/]+)$/);
  if (req.method === "GET" && publicBattleMatch) {
    const user = optionalUser(req);
    const battle = readJsonFile(BATTLES_FILE).find((item) => item.id === publicBattleMatch[1]);
    if (!battle) {
      sendJson(res, 404, { error: "无名战不存在" });
      return;
    }
    const phase = battlePhase(battle);
    const submissions = readJsonFile(SUBMISSIONS_FILE)
      .filter((item) => item.battleId === battle.id && item.status === "approved" && item.savedFileName)
      .sort((a, b) => a.songId.localeCompare(b.songId, "zh-CN"))
      .map((item) => publicBattleSubmission(item, phase.kind === "ended"));
    sendJson(res, 200, {
      battle: publicBattle(battle, user),
      submissions: ["sniping", "ended"].includes(phase.kind) ? submissions : [],
      canDownload: canDownloadBattleCharts(user, battle.id)
    });
    return;
  }

  const publicBattleDownloadMatch = url.pathname.match(/^\/api\/battles\/([^/]+)\/download-approved$/);
  if (req.method === "GET" && publicBattleDownloadMatch) {
    const user = requireUser(req, res);
    if (!user) return;
    const battle = readJsonFile(BATTLES_FILE).find((item) => item.id === publicBattleDownloadMatch[1]);
    if (!battle) {
      sendJson(res, 404, { error: "无名战不存在" });
      return;
    }
    if (!["sniping", "ended"].includes(battlePhase(battle).kind)) {
      sendJson(res, 403, { error: "当前阶段暂不开放谱面下载" });
      return;
    }
    if (!canDownloadBattleCharts(user, battle.id)) {
      sendJson(res, 403, { error: "仅参赛谱师可以下载该无名战谱面" });
      return;
    }
    sendBattleArchive(res, battle);
    return;
  }

  const publicSubmissionDownloadMatch = url.pathname.match(/^\/api\/battles\/([^/]+)\/submissions\/([^/]+)\/download$/);
  if (req.method === "GET" && publicSubmissionDownloadMatch) {
    const user = requireUser(req, res);
    if (!user) return;
    const battle = readJsonFile(BATTLES_FILE).find((item) => item.id === publicSubmissionDownloadMatch[1]);
    const submission = readJsonFile(SUBMISSIONS_FILE).find((item) => item.id === publicSubmissionDownloadMatch[2]);
    if (!battle || !submission || submission.battleId !== battle.id || submission.status !== "approved" || !submission.savedFileName) {
      sendJson(res, 404, { error: "谱面不存在" });
      return;
    }
    if (!["sniping", "ended"].includes(battlePhase(battle).kind)) {
      sendJson(res, 403, { error: "当前阶段暂不开放谱面下载" });
      return;
    }
    if (!canDownloadBattleCharts(user, battle.id)) {
      sendJson(res, 403, { error: "仅参赛谱师可以下载该无名战谱面" });
      return;
    }
    const filePath = uploadPath(submission.savedFileName);
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: "文件已不存在" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(submission.originalFileName || `${submission.songId}.zip`)}"`
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const battleRulesDownloadMatch = url.pathname.match(/^\/api\/battles\/([^/]+)\/rules$/);
  if (req.method === "GET" && battleRulesDownloadMatch) {
    const user = requireUser(req, res);
    if (!user) return;
    const battle = readJsonFile(BATTLES_FILE).find((item) => item.id === battleRulesDownloadMatch[1]);
    if (!battle) {
      sendJson(res, 404, { error: "无名战不存在" });
      return;
    }
    if (!canDownloadBattleRules(user, battle)) {
      sendJson(res, 403, { error: "无法下载该无名战规则文档" });
      return;
    }
    if (!battle.rulesFileName) {
      sendJson(res, 404, { error: "当前没有规则文档" });
      return;
    }
    const filePath = uploadPath(battle.rulesFileName);
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: "当前没有规则文档" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(battle.rulesOriginalFileName || `${battle.title}-rules.pdf`)}"`
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const hostSubmissionsMatch = url.pathname.match(/^\/api\/host\/battles\/([^/]+)\/submissions$/);
  if (req.method === "GET" && hostSubmissionsMatch) {
    const host = requireBattleHost(req, res, hostSubmissionsMatch[1]);
    if (!host) return;
    const statusFilter = clean(url.searchParams.get("status"));
    const submissions = readJsonFile(SUBMISSIONS_FILE)
      .filter((item) => item.battleId === host.battle.id)
      .filter((submission) => {
        if (statusFilter === "approved") return submission.status === "approved";
        if (statusFilter === "review") return ["pending", "waiting_collaboration"].includes(submission.status);
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(adminSubmission);
    sendJson(res, 200, { submissions });
    return;
  }

  const hostLimitsMatch = url.pathname.match(/^\/api\/host\/battles\/([^/]+)\/limits$/);
  if (req.method === "PATCH" && hostLimitsMatch) {
    const host = requireBattleHost(req, res, hostLimitsMatch[1]);
    if (!host) return;
    const body = await readJson(req);
    const submissionLimits = {
      solo: normalizeSubmissionLimit(body.soloLimit),
      collab: normalizeSubmissionLimit(body.collabLimit),
      bonus: normalizeSubmissionLimit(body.bonusLimit)
    };
    const locks = normalizeSettingLocks(host.battle.settingLocks);
    const optionalChecks = mergeOptionalChecksByLocks(normalizeOptionalChecks(host.battle.optionalChecks), buildOptionalChecks(body), locks.optionalChecks);
    const divisionMode = clean(body.divisionMode) === "custom" ? "custom" : "standard";
    const customDivisions = divisionMode === "custom" ? normalizeCustomDivisions(body.customDivisions) : [];
    if (Object.values(submissionLimits).some((value) => value !== "" && value < 0)) {
      sendJson(res, 400, { error: "投稿数量限制不能小于 0" });
      return;
    }
    if (customDivisions.some((division) => division.limit !== "" && division.limit < 0)) {
      sendJson(res, 400, { error: "投稿数量限制不能小于 0" });
      return;
    }
    if (optionalChecks.duration.min === -1 || optionalChecks.duration.max === -1) {
      sendJson(res, 400, { error: "曲目时长限制必须为非负数字" });
      return;
    }
    if (!validDurationRange(optionalChecks.duration)) {
      sendJson(res, 400, { error: "曲目最短时长不能大于最长时长" });
      return;
    }
  const difficultyValidation = validateDifficultyRange(optionalChecks.difficulty);
  if (!difficultyValidation.ok) {
    sendJson(res, 400, { error: difficultyValidation.error });
    return;
  }
    if (divisionMode === "custom" && !customDivisions.length) {
      sendJson(res, 400, { error: "自定义分组至少需要添加一个分组" });
      return;
    }
    const battles = readJsonFile(BATTLES_FILE);
    const battle = battles.find((item) => item.id === host.battle.id);
    battle.submissionLimits = submissionLimits;
    battle.optionalChecks = optionalChecks;
    battle.divisionMode = divisionMode;
    battle.customDivisions = customDivisions;
    battle.updatedAt = new Date().toISOString();
    writeJsonFile(BATTLES_FILE, battles);
    sendJson(res, 200, { battle: publicBattle(battle, host.user) });
    return;
  }

  const hostRulesMatch = url.pathname.match(/^\/api\/host\/battles\/([^/]+)\/rules$/);
  if (req.method === "POST" && hostRulesMatch) {
    const host = requireBattleHost(req, res, hostRulesMatch[1]);
    if (!host) return;
    if (host.battle.settingLocks?.rules) {
      sendJson(res, 403, { error: "规则文档已锁定，无法修改" });
      return;
    }
    const form = await readMultipartForm(req, res);
    if (!form) return;
    const result = saveBattleRulesFile(host.battle.id, form.files.rules);
    if (!result.ok) {
      sendJson(res, 400, { error: result.error });
      return;
    }
    const battles = readJsonFile(BATTLES_FILE);
    const battle = battles.find((item) => item.id === host.battle.id);
    battle.rulesFileName = result.fileName;
    battle.rulesOriginalFileName = result.originalFileName;
    battle.updatedAt = new Date().toISOString();
    writeJsonFile(BATTLES_FILE, battles);
    sendJson(res, 200, { battle: publicBattle(battle, host.user) });
    return;
  }

  const hostSettingsMatch = url.pathname.match(/^\/api\/host\/battles\/([^/]+)\/settings$/);
  if (req.method === "POST" && hostSettingsMatch) {
    const host = requireBattleHost(req, res, hostSettingsMatch[1]);
    if (!host) return;
    const form = await readFlexibleForm(req, res);
    if (!form) return;
    if (host.battle.settingLocks?.banner && form.files.banner?.data.length) {
      sendJson(res, 403, { error: "Banner图片已锁定，无法修改" });
      return;
    }
    if (host.battle.settingLocks?.description) {
      form.fields.description = host.battle.description || host.battle.note || "";
      form.fields.note = host.battle.description || host.battle.note || "";
    }
    const settings = buildHostBattleSettings(form.fields, host.battle);
    if (!settings.ok) {
      sendJson(res, 400, { error: settings.error });
      return;
    }
    const battles = readJsonFile(BATTLES_FILE);
    const battle = battles.find((item) => item.id === host.battle.id);
    Object.assign(battle, settings.value, { updatedAt: new Date().toISOString() });
    ensureBattleUploadDirs(battle.id);
    if (form.files.banner?.data.length) {
      battle.bannerFileName = saveUpload(form.files.banner.data, sanitizeFileName(form.files.banner.filename || "battle-banner"), battleUploadDir(battle.id, "banner"));
    }
    writeJsonFile(BATTLES_FILE, battles);
    sendJson(res, 200, { battle: publicBattle(battle, host.user) });
    return;
  }

  const hostArchiveMatch = url.pathname.match(/^\/api\/host\/battles\/([^/]+)\/download$/);
  if (req.method === "GET" && hostArchiveMatch) {
    const host = requireBattleHost(req, res, hostArchiveMatch[1]);
    if (!host) return;
    sendBattleArchive(res, host.battle, { includeAll: true });
    return;
  }

  const hostSubmissionDownloadMatch = url.pathname.match(/^\/api\/host\/battles\/([^/]+)\/submissions\/([^/]+)\/download$/);
  if (req.method === "GET" && hostSubmissionDownloadMatch) {
    const host = requireBattleHost(req, res, hostSubmissionDownloadMatch[1]);
    if (!host) return;
    const submission = readJsonFile(SUBMISSIONS_FILE).find((item) => item.id === hostSubmissionDownloadMatch[2]);
    if (!submission || submission.battleId !== host.battle.id || !submission.savedFileName || submission.status === "withdrawn") {
      sendJson(res, 404, { error: "谱面不存在" });
      return;
    }
    const filePath = uploadPath(submission.savedFileName);
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: "文件已不存在" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(submission.originalFileName || `${submission.songId}.zip`)}"`
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const hostReviewMatch = url.pathname.match(/^\/api\/host\/battles\/([^/]+)\/submissions\/([^/]+)\/review$/);
  if (req.method === "PATCH" && hostReviewMatch) {
    const host = requireBattleHost(req, res, hostReviewMatch[1]);
    if (!host) return;
    const body = await readJson(req);
    const status = clean(body.status);
    if (!["approved", "rejected"].includes(status)) {
      sendJson(res, 400, { error: "审核状态必须为通过或驳回" });
      return;
    }
    const submissions = readJsonFile(SUBMISSIONS_FILE);
    const submission = submissions.find((item) => item.id === hostReviewMatch[2] && item.battleId === host.battle.id);
    if (!submission) {
      sendJson(res, 404, { error: "提交记录不存在" });
      return;
    }
    const reviewNote = clean(body.reviewNote);
    if (status === "rejected" && !reviewNote) {
      sendJson(res, 400, { error: "驳回谱面时需要填写审核意见" });
      return;
    }
    submission.status = status;
    submission.reviewNote = status === "rejected" ? reviewNote : "";
    submission.reviewedBy = host.user.username;
    submission.reviewedAt = new Date().toISOString();
    if (status === "rejected") deleteSubmissionFile(submission);
    writeJsonFile(SUBMISSIONS_FILE, submissions);
    sendJson(res, 200, { submission: adminSubmission(submission) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/jacket-collections") {
    const user = requireUser(req, res);
    if (!user) return;
    const form = await readMultipartForm(req, res);
    if (!form) return;
    const image = form.files.jacket;
    if (!image || image.data.length === 0) {
      sendJson(res, 400, { error: "请上传封面图片" });
      return;
    }
    const safeName = sanitizeFileName(image.filename || "jacket.jpg");
    const ext = path.extname(safeName).toLowerCase();
    if (ext !== ".jpg") {
      sendJson(res, 400, { error: "封面图片仅允许 .jpg 格式" });
      return;
    }
    if (image.data.length > 1.28 * 1024 * 1024) {
      sendJson(res, 400, { error: "封面图片大小不能超过 1.28MB" });
      return;
    }
    if (!isJpeg(image.data)) {
      sendJson(res, 400, { error: "封面图片实际格式必须为 jpg" });
      return;
    }
    const imageSize = getJpegSize(image.data);
    if (!imageSize || imageSize.width < 256 || imageSize.height < 256) {
      sendJson(res, 400, { error: "封面图片大小不能小于 256*256" });
      return;
    }
    if (Math.max(imageSize.width / imageSize.height, imageSize.height / imageSize.width) >= 1.2) {
      sendJson(res, 400, { error: "封面图片高宽比例不符合要求" });
      return;
    }
    const savedFileName = saveUpload(image.data, safeName, JACKET_UPLOAD_DIR);
    const jackets = readJsonFile(JACKETS_FILE);
    const item = {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      chartName: user.chartName || user.username,
      title: clean(form.fields.title),
      note: clean(form.fields.note),
      originalFileName: safeName,
      savedFileName,
      fileSize: image.data.length,
      createdAt: new Date().toISOString()
    };
    jackets.push(item);
    writeJsonFile(JACKETS_FILE, jackets);
    sendJson(res, 201, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/treasure/claim") {
    const user = requireUser(req, res);
    if (!user) return;
    const now = Date.now();
    const blockedUntil = treasureCooldowns.get(user.id) || 0;
    if (blockedUntil > now) {
      sendJson(res, 429, { error: "点击过快，请稍后再开启", retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000) });
      return;
    }
    const recentClicks = (treasureClickWindows.get(user.id) || []).filter((time) => now - time < 2000);
    recentClicks.push(now);
    treasureClickWindows.set(user.id, recentClicks);
    if (recentClicks.length > 4) {
      const nextAllowedAt = now + 30 * 1000;
      treasureCooldowns.set(user.id, nextAllowedAt);
      treasureClickWindows.set(user.id, []);
      sendJson(res, 429, { error: "点击过快，30秒内无法开启", retryAfterSeconds: 30 });
      return;
    }
    const users = readJsonFile(USERS_FILE);
    const current = users.find((item) => item.id === user.id);
    if (current) {
      current.lastTreasureClickAt = new Date(now).toISOString();
      writeJsonFile(USERS_FILE, users);
    }
    const drops = readJsonFile(TREASURE_DROPS_FILE).filter((drop) => Number(drop.probability) > 0);
    if (!drops.length) {
      sendJson(res, 404, { error: "宝箱暂无可用掉落" });
      return;
    }
    const drop = pickWeightedDrop(drops);
    sendJson(res, 200, { drop: publicTreasureDrop(drop) });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/submissions") {
    sendJson(res, 200, { submissions: [] });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/my/submissions") {
    const user = requireUser(req, res);
    if (!user) return;
    const submissions = readJsonFile(SUBMISSIONS_FILE)
      .filter((item) => canViewSubmission(user, item))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicSubmission);
    sendJson(res, 200, { submissions });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/my/host-todos") {
    const user = requireUser(req, res);
    if (!user) return;
    const hostedBattles = readJsonFile(BATTLES_FILE)
      .filter((battle) => canHostBattle(user, battle))
      .filter((battle) => ["writing", "packing", "sniping"].includes(battlePhase(battle).kind));
    const hostedBattleIds = new Set(hostedBattles.map((battle) => battle.id));
    const reviewSubmissions = readJsonFile(SUBMISSIONS_FILE)
      .filter((submission) => hostedBattleIds.has(submission.battleId) && submission.status === "pending");
    const count = reviewSubmissions.length;
    sendJson(res, 200, {
      isHost: hostedBattles.length > 0,
      count,
      battles: hostedBattles.map((battle) => ({
        ...publicBattle(battle, user),
        todoCount: reviewSubmissions.filter((submission) => submission.battleId === battle.id).length
      }))
    });
    return;
  }

  const userSubmissionMatch = url.pathname.match(/^\/api\/submissions\/([^/]+)$/);
  if (req.method === "GET" && userSubmissionMatch) {
    const user = requireUser(req, res);
    if (!user) return;
    const submission = readJsonFile(SUBMISSIONS_FILE).find((item) => item.id === userSubmissionMatch[1]);
    if (!submission || !canViewSubmission(user, submission)) {
      sendJson(res, 404, { error: "提交记录不存在" });
      return;
    }
    sendJson(res, 200, { submission: user.role === "admin" ? adminSubmission(submission) : publicSubmission(submission) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/submissions") {
    const user = requireUser(req, res);
    if (!user) return;
    if (user.role !== "user") {
      sendJson(res, 403, { error: "管理员账号不能提交比赛结果" });
      return;
    }

    const form = await readMultipartForm(req, res);
    if (!form) return;
    const division = clean(form.fields.division);
    const battleId = clean(form.fields.battleId);
    const songId = clean(form.fields.songId);
    const collaboratorIds = parseJsonArray(form.fields.collaborators);
    const bonusChart = clean(form.fields.bonusChart) === "on" || clean(form.fields.bonusChart) === "true";
    const notes = clean(form.fields.notes);
    if (dailyChartSubmissionCount(user.id) >= DAILY_CHART_SUBMISSION_LIMIT) {
      const message = "超出单日可投稿谱面上限，请明日再尝试投稿";
      sendJson(res, 400, { error: message, autoCheckErrors: [message] });
      return;
    }

    if (!battleId || !songId) {
      sendJson(res, 400, { error: "欲参加的无名战和 songid 不能为空" });
      return;
    }
    if (!/^[a-z0-9_]+$/.test(songId)) {
      sendJson(res, 400, { error: "songid 仅能包含小写字母、阿拉伯数字与下划线" });
      return;
    }

    const battle = findSubmittableBattle(battleId);
    if (!battle) {
      sendJson(res, 400, { error: "所选无名战不在提交时间内" });
      return;
    }
    if (!canUserAccessBattle(user, battle)) {
      sendJson(res, 403, { error: "不在要求的谱师组中" });
      return;
    }
    const divisionConfig = divisionConfigForBattle(battle, division);
    if (!divisionConfig) {
      sendJson(res, 400, { error: "请选择参赛组别" });
      return;
    }
    const users = readJsonFile(USERS_FILE);
    const collaborators = collaboratorIds
      .filter((id, index, all) => id && id !== user.id && all.indexOf(id) === index)
      .map((id) => users.find((item) => item.id === id && item.role === "user" && canUserAccessBattle(item, battle)))
      .filter(Boolean)
      .map((item) => ({ userId: item.id, username: item.username, chartName: item.chartName, status: "pending", respondedAt: "" }));

    const collaborationError = validateDivisionCollaborators(divisionConfig, collaborators);
    if (collaborationError) {
      sendJson(res, 400, { error: collaborationError });
      return;
    }
    if (!hasSubmissionSlot(user.id, battle, division)) {
      sendJson(res, 400, { error: "对应类别投稿谱面数量已满", autoCheckErrors: ["对应类别投稿谱面数量已满"] });
      return;
    }
    if (hasDuplicateSongId(user.id, battle.id, songId)) {
      const message = `已提交过songid为'${songId}'的谱面`;
      sendJson(res, 400, { error: message, autoCheckErrors: [message] });
      return;
    }

    const chartFile = form.files.chartFile;
    if (!chartFile || chartFile.data.length === 0) {
      sendJson(res, 400, { error: "请上传谱面 zip 文件" });
      return;
    }
    if (chartFile.data.length > MAX_CHART_ZIP_SIZE) {
      const message = "谱面压缩包过大（超过12.8MB）";
      sendJson(res, 400, { error: message, autoCheckErrors: [message] });
      return;
    }
    const safeName = sanitizeFileName(chartFile.filename || "chart.zip");
    if (path.extname(safeName).toLowerCase() !== ".zip") {
      sendJson(res, 400, { error: "谱面文件必须为 zip 文件" });
      return;
    }

    const submissions = readJsonFile(SUBMISSIONS_FILE);
    const status = collaborators.length ? "waiting_collaboration" : "pending";
    const submission = {
      id: crypto.randomUUID(),
      type: "chart",
      division,
      divisionName: divisionConfig.name,
      battleId: battle.id,
      battleTitle: battle.title,
      songId,
      bonusChart,
      notes,
      userId: user.id,
      username: user.username,
      chartName: user.chartName,
      collaborators,
      originalFileName: safeName,
      savedFileName: "",
      fileSize: chartFile.data.length,
      status,
      reviewNote: "",
      reviewedBy: "",
      reviewedAt: "",
      createdAt: new Date().toISOString()
    };
    const check = applyAutoCheck(submission, chartFile.data);
    if (!check.ok) {
      sendJson(res, 400, { error: check.errors.join("；"), autoCheckErrors: check.errors });
      return;
    }
    submission.savedFileName = saveUpload(chartFile.data, safeName, battleUploadDir(battle.id, "charts"));
    submissions.push(submission);
    writeJsonFile(SUBMISSIONS_FILE, submissions);
    sendJson(res, 201, { submission: publicSubmission(submission) });
    return;
  }

  if (req.method === "PATCH" && userSubmissionMatch) {
    const user = requireUser(req, res);
    if (!user) return;
    if (user.role !== "user") {
      sendJson(res, 403, { error: "管理员不能修改普通用户谱面" });
      return;
    }

    const submissions = readJsonFile(SUBMISSIONS_FILE);
    const submission = submissions.find((item) => item.id === userSubmissionMatch[1]);
    if (!submission || submission.userId !== user.id) {
      sendJson(res, 404, { error: "提交记录不存在" });
      return;
    }
    if (!canModifySubmissionNow(submission)) {
      sendJson(res, 403, { error: "对应无名战已不在开放时间内，无法修改" });
      return;
    }

    const form = await readMultipartForm(req, res);
    if (!form) return;
    const parsed = parseChartSubmissionForm(form, user, { allowModify: true, currentSubmission: submission });
    if (!parsed.ok) {
      sendJson(res, 400, { error: parsed.error, autoCheckErrors: parsed.autoCheckErrors || [] });
      return;
    }
    if (!hasSubmissionSlot(user.id, parsed.battle, parsed.division, submission.id)) {
      sendJson(res, 400, { error: "对应类别投稿谱面数量已满", autoCheckErrors: ["对应类别投稿谱面数量已满"] });
      return;
    }
    if (hasDuplicateSongId(user.id, parsed.battle.id, parsed.songId, submission.id)) {
      const message = `已提交过songid为'${parsed.songId}'的谱面`;
      sendJson(res, 400, { error: message, autoCheckErrors: [message] });
      return;
    }

    const nextSubmission = {
      ...submission,
      type: "chart",
      division: parsed.division,
      divisionName: divisionConfigForBattle(parsed.battle, parsed.division)?.name || parsed.division,
      battleId: parsed.battle.id,
      battleTitle: parsed.battle.title,
      songId: parsed.songId,
      bonusChart: parsed.bonusChart,
      notes: parsed.notes,
      collaborators: parsed.collaborators,
      originalFileName: parsed.safeName,
      savedFileName: "",
      fileSize: parsed.chartFile.data.length,
      status: "pending",
      reviewNote: "",
      reviewedBy: "",
      reviewedAt: "",
      updatedAt: new Date().toISOString()
    };
    const check = applyAutoCheck(nextSubmission, parsed.chartFile.data);
    if (!check.ok) {
      sendJson(res, 400, { error: check.errors.join("；"), autoCheckErrors: check.errors });
      return;
    }
    nextSubmission.savedFileName = saveUpload(parsed.chartFile.data, parsed.safeName, battleUploadDir(parsed.battle.id, "charts"));
    Object.assign(submission, nextSubmission);
    writeJsonFile(SUBMISSIONS_FILE, submissions);
    sendJson(res, 200, { submission: publicSubmission(submission) });
    return;
  }

  const withdrawalMatch = url.pathname.match(/^\/api\/submissions\/([^/]+)\/withdraw$/);
  if (req.method === "PATCH" && withdrawalMatch) {
    const user = requireUser(req, res);
    if (!user) return;
    const submissions = readJsonFile(SUBMISSIONS_FILE);
    const submission = submissions.find((item) => item.id === withdrawalMatch[1]);
    if (!submission || submission.userId !== user.id) {
      sendJson(res, 404, { error: "提交记录不存在" });
      return;
    }
    if (!canWithdrawSubmission(submission)) {
      sendJson(res, 400, { error: "当前谱面无法撤回" });
      return;
    }
    submission.status = "withdrawn";
    submission.withdrawnAt = new Date().toISOString();
    deleteSubmissionFile(submission);
    writeJsonFile(SUBMISSIONS_FILE, submissions);
    sendJson(res, 200, { submission: publicSubmission(submission) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/my/collaboration-requests") {
    const user = requireUser(req, res);
    if (!user) return;
    const requests = readJsonFile(SUBMISSIONS_FILE)
      .filter((item) => (item.collaborators || []).some((collaborator) => collaborator.userId === user.id && !collaborator.hiddenAt))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({
        submissionId: item.id,
        songId: item.songId,
        battleTitle: item.battleTitle,
        division: item.division,
        divisionName: item.divisionName || "",
        ownerChartName: item.chartName,
        status: item.collaborators.find((collaborator) => collaborator.userId === user.id).status,
        createdAt: item.createdAt
      }));
    sendJson(res, 200, { requests });
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/my/collaboration-requests/processed") {
    const user = requireUser(req, res);
    if (!user) return;
    const submissions = readJsonFile(SUBMISSIONS_FILE);
    let count = 0;
    submissions.forEach((submission) => {
      (submission.collaborators || []).forEach((collaborator) => {
        if (collaborator.userId === user.id && ["accepted", "rejected"].includes(collaborator.status) && !collaborator.hiddenAt) {
          collaborator.hiddenAt = new Date().toISOString();
          count += 1;
        }
      });
    });
    writeJsonFile(SUBMISSIONS_FILE, submissions);
    sendJson(res, 200, { count });
    return;
  }

  const collaborationMatch = url.pathname.match(/^\/api\/my\/collaboration-requests\/([^/]+)$/);
  if (req.method === "PATCH" && collaborationMatch) {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readJson(req);
    const action = clean(body.action);
    if (!["accepted", "rejected"].includes(action)) {
      sendJson(res, 400, { error: "合作申请操作不正确" });
      return;
    }

    const submissions = readJsonFile(SUBMISSIONS_FILE);
    const submission = submissions.find((item) => item.id === collaborationMatch[1]);
    const collaborator = submission && (submission.collaborators || []).find((item) => item.userId === user.id);
    if (!submission || !collaborator) {
      sendJson(res, 404, { error: "合作申请不存在" });
      return;
    }

    if (collaborator.status !== "pending") {
      sendJson(res, 409, { error: "合作申请已处理" });
      return;
    }
    if (action === "accepted" && !hasSubmissionSlot(user.id, submission.battleId, submission.division, submission.id)) {
      sendJson(res, 400, { error: "对应类别投稿谱面数量已满" });
      return;
    }

    collaborator.status = action;
    collaborator.respondedAt = new Date().toISOString();
    if (action === "rejected") {
      submission.status = "collaboration_rejected";
      deleteSubmissionFile(submission);
    } else if (submission.status === "waiting_collaboration" && (submission.collaborators || []).every((item) => item.status === "accepted")) {
      submission.status = "pending";
    }
    writeJsonFile(SUBMISSIONS_FILE, submissions);
    sendJson(res, 200, { submission: publicSubmission(submission) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/profile") {
    const user = requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/profile") {
    const user = requireUser(req, res);
    if (!user) return;
    const form = await readMultipartForm(req, res);
    if (!form) return;

    const users = readJsonFile(USERS_FILE);
    const current = users.find((item) => item.id === user.id);
    current.bilibili = clean(form.fields.bilibili);
    current.bio = clean(form.fields.bio);
    current.showSubmissions = clean(form.fields.showSubmissions) === "on";

    const avatar = form.files.avatar;
    if (avatar && avatar.data.length > 0) {
      current.avatarFileName = saveUpload(avatar.data, sanitizeFileName(avatar.filename || "avatar"), USER_AVATAR_UPLOAD_DIR);
    }

    writeJsonFile(USERS_FILE, users);
    sendJson(res, 200, { user: publicUser(current) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/profile/password") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readJson(req);
    const oldPassword = String(body.oldPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");
    if (user.passwordHash !== hashPassword(oldPassword, user.salt)) {
      sendJson(res, 400, { error: "旧密码不正确" });
      return;
    }
    if (newPassword.length < 6) {
      sendJson(res, 400, { error: "新密码至少 6 位" });
      return;
    }
    if (newPassword !== confirmPassword) {
      sendJson(res, 400, { error: "两次输入的新密码不一致" });
      return;
    }
    const users = readJsonFile(USERS_FILE);
    const current = users.find((item) => item.id === user.id);
    current.salt = crypto.randomBytes(16).toString("hex");
    current.passwordHash = hashPassword(newPassword, current.salt);
    current.passwordUpdatedAt = new Date().toISOString();
    writeJsonFile(USERS_FILE, users);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chart-name-requests") {
    const user = requireUser(req, res);
    if (!user) return;
    if (user.role !== "user") {
      sendJson(res, 403, { error: "管理员无需申请修改谱师名义" });
      return;
    }

    const body = await readJson(req);
    const requestedChartName = clean(body.requestedChartName);
    const reason = clean(body.reason);
    if (!requestedChartName) {
      sendJson(res, 400, { error: "欲变更的谱师名义不能为空" });
      return;
    }

    const requests = readJsonFile(REQUESTS_FILE);
    if (requests.some((item) => item.userId === user.id && item.status === "pending")) {
      sendJson(res, 409, { error: "已有待审核的修改申请" });
      return;
    }

    const request = {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      currentChartName: user.chartName,
      requestedChartName,
      reason,
      status: "pending",
      reviewNote: "",
      reviewedBy: "",
      reviewedAt: "",
      createdAt: new Date().toISOString()
    };
    requests.push(request);
    writeJsonFile(REQUESTS_FILE, requests);
    sendJson(res, 201, { request });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/my/chart-name-requests") {
    const user = requireUser(req, res);
    if (!user) return;
    const requests = readJsonFile(REQUESTS_FILE)
      .filter((item) => item.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    sendJson(res, 200, { requests });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/register-codes") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const codes = readJsonFile(CODES_FILE);
    const now = new Date();
    codes.forEach((code) => {
      if (!code.usedAt && !code.invalidatedAt && new Date(code.expiresAt).getTime() > now.getTime()) {
        code.invalidatedAt = now.toISOString();
      }
    });

    const code = {
      id: crypto.randomUUID(),
      code: crypto.randomBytes(4).toString("hex").toUpperCase(),
      createdBy: admin.id,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
      usedAt: "",
      usedBy: "",
      invalidatedAt: ""
    };
    codes.push(code);
    writeJsonFile(CODES_FILE, codes);
    sendJson(res, 201, { code: publicCode(code) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/register-codes") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const codes = readJsonFile(CODES_FILE)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map(publicCode);
    sendJson(res, 200, { codes });
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/admin/register-codes/invalid") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const codes = readJsonFile(CODES_FILE);
    const active = codes.filter((code) => codeStatus(code) === "active");
    writeJsonFile(CODES_FILE, active);
    sendJson(res, 200, { removed: codes.length - active.length });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/submissions") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const battleId = clean(url.searchParams.get("battleId"));
    const statusFilter = clean(url.searchParams.get("status"));
    const submissions = readJsonFile(SUBMISSIONS_FILE)
      .slice()
      .filter((submission) => !battleId || submission.battleId === battleId)
      .filter((submission) => {
        if (statusFilter === "approved") return submission.status === "approved";
        if (statusFilter === "review") return ["pending", "waiting_collaboration"].includes(submission.status);
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(adminSubmission);
    sendJson(res, 200, { submissions });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/submissions/clear-expired-review") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const battles = readJsonFile(BATTLES_FILE);
    const expiredBattleIds = new Set(
      battles
        .filter((battle) => ["sniping", "ended"].includes(battlePhase(battle).kind))
        .map((battle) => battle.id)
    );
    const submissions = readJsonFile(SUBMISSIONS_FILE);
    const keep = [];
    let removed = 0;
    submissions.forEach((submission) => {
      const expiredReview = expiredBattleIds.has(submission.battleId) && submission.status !== "approved";
      if (expiredReview) {
        deleteSubmissionFile(submission);
        removed += 1;
      } else {
        keep.push(submission);
      }
    });
    writeJsonFile(SUBMISSIONS_FILE, keep);
    sendJson(res, 200, { removed });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/submissions/approve-all") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const submissions = readJsonFile(SUBMISSIONS_FILE);
    let count = 0;
    submissions.forEach((submission) => {
      if (submission.status === "pending") {
        submission.status = "approved";
        submission.reviewNote = "";
        submission.reviewedBy = admin.username;
        submission.reviewedAt = new Date().toISOString();
        count += 1;
      }
    });
    writeJsonFile(SUBMISSIONS_FILE, submissions);
    sendJson(res, 200, { count });
    return;
  }

  const battleDownloadMatch = url.pathname.match(/^\/api\/admin\/battles\/([^/]+)\/download-approved$/);
  if (req.method === "GET" && battleDownloadMatch) {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const battle = readJsonFile(BATTLES_FILE).find((item) => item.id === battleDownloadMatch[1]);
    if (!battle) {
      sendJson(res, 404, { error: "无名战不存在" });
      return;
    }
    sendBattleArchive(res, battle);
    return;
  }

  const submissionReviewMatch = url.pathname.match(/^\/api\/admin\/submissions\/([^/]+)\/review$/);
  if (req.method === "PATCH" && submissionReviewMatch) {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const status = clean(body.status);
    if (!["approved", "rejected"].includes(status)) {
      sendJson(res, 400, { error: "审核状态必须为通过或驳回" });
      return;
    }

    const submissions = readJsonFile(SUBMISSIONS_FILE);
    const submission = submissions.find((item) => item.id === submissionReviewMatch[1]);
    if (!submission) {
      sendJson(res, 404, { error: "提交记录不存在" });
      return;
    }

    const reviewNote = clean(body.reviewNote);
    if (status === "rejected" && !reviewNote) {
      sendJson(res, 400, { error: "驳回谱面时需要填写审核意见" });
      return;
    }

    submission.status = status;
    submission.reviewNote = status === "rejected" ? reviewNote : "";
    submission.reviewedBy = admin.username;
    submission.reviewedAt = new Date().toISOString();
    if (status === "rejected") {
      deleteSubmissionFile(submission);
    }
    writeJsonFile(SUBMISSIONS_FILE, submissions);
    sendJson(res, 200, { submission: adminSubmission(submission) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/chart-name-requests") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const requests = readJsonFile(REQUESTS_FILE)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    sendJson(res, 200, { requests });
    return;
  }

  const requestReviewMatch = url.pathname.match(/^\/api\/admin\/chart-name-requests\/([^/]+)\/review$/);
  if (req.method === "PATCH" && requestReviewMatch) {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const status = clean(body.status);
    if (!["approved", "rejected"].includes(status)) {
      sendJson(res, 400, { error: "审核状态必须为通过或驳回" });
      return;
    }

    const requests = readJsonFile(REQUESTS_FILE);
    const request = requests.find((item) => item.id === requestReviewMatch[1]);
    if (!request) {
      sendJson(res, 404, { error: "申请不存在" });
      return;
    }
    if (request.status !== "pending") {
      sendJson(res, 409, { error: "该申请已经审核" });
      return;
    }

    request.status = status;
    request.reviewNote = clean(body.reviewNote);
    request.reviewedBy = admin.username;
    request.reviewedAt = new Date().toISOString();

    if (status === "approved") {
      const users = readJsonFile(USERS_FILE);
      const target = users.find((item) => item.id === request.userId);
      if (target) {
        target.chartName = request.requestedChartName;
        writeJsonFile(USERS_FILE, users);
      }
    }

    writeJsonFile(REQUESTS_FILE, requests);
    sendJson(res, 200, { request });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/collections") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    sendJson(res, 200, { collections: readJsonFile(COLLECTIONS_FILE).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicCollection) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/backgrounds") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    sendJson(res, 200, { backgrounds: readJsonFile(BGS_FILE) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/backgrounds") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const name = clean(body.name);
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      sendJson(res, 400, { error: "bg名仅限由数字、字母、下划线与-组成" });
      return;
    }
    const backgrounds = readJsonFile(BGS_FILE);
    if (backgrounds.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      sendJson(res, 400, { error: "该bg名已存在" });
      return;
    }
    const item = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    backgrounds.push(item);
    backgrounds.sort((a, b) => a.name.localeCompare(b.name));
    writeJsonFile(BGS_FILE, backgrounds);
    sendJson(res, 201, { background: item });
    return;
  }

  const backgroundMatch = url.pathname.match(/^\/api\/admin\/backgrounds\/([^/]+)$/);
  if (backgroundMatch && req.method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const backgrounds = readJsonFile(BGS_FILE);
    writeJsonFile(BGS_FILE, backgrounds.filter((item) => item.id !== backgroundMatch[1]));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/treasure-drops") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const drops = readJsonFile(TREASURE_DROPS_FILE).map(publicTreasureDrop);
    sendJson(res, 200, { drops });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/treasure-drops") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const form = await readMultipartForm(req, res);
    if (!form) return;
    const name = clean(form.fields.name);
    const probability = Number(form.fields.probability || 0);
    const image = form.files.image;
    if (!name || !Number.isFinite(probability) || probability < 0) {
      sendJson(res, 400, { error: "掉落名称和非负概率不能为空" });
      return;
    }
    if (!image || image.data.length === 0) {
      sendJson(res, 400, { error: "请上传掉落图片" });
      return;
    }
    const drops = readJsonFile(TREASURE_DROPS_FILE);
    const drop = {
      id: crypto.randomUUID(),
      name,
      probability,
      imageFileName: saveUpload(image.data, sanitizeFileName(image.filename || "treasure-drop"), TREASURE_CHEST_UPLOAD_DIR),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    drops.push(drop);
    writeJsonFile(TREASURE_DROPS_FILE, drops);
    sendJson(res, 201, { drop: publicTreasureDrop(drop) });
    return;
  }

  const treasureDropMatch = url.pathname.match(/^\/api\/admin\/treasure-drops\/([^/]+)$/);
  if (treasureDropMatch && req.method === "PATCH") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const form = await readMultipartForm(req, res);
    if (!form) return;
    const drops = readJsonFile(TREASURE_DROPS_FILE);
    const drop = drops.find((item) => item.id === treasureDropMatch[1]);
    if (!drop) {
      sendJson(res, 404, { error: "掉落不存在" });
      return;
    }
    const probability = Number(form.fields.probability ?? drop.probability);
    if (!Number.isFinite(probability) || probability < 0) {
      sendJson(res, 400, { error: "概率必须为非负数" });
      return;
    }
    drop.name = clean(form.fields.name) || drop.name;
    drop.probability = probability;
    if (form.files.image?.data.length) {
      drop.imageFileName = saveUpload(form.files.image.data, sanitizeFileName(form.files.image.filename || "treasure-drop"), TREASURE_CHEST_UPLOAD_DIR);
      delete drop.assetUrl;
    }
    drop.updatedAt = new Date().toISOString();
    writeJsonFile(TREASURE_DROPS_FILE, drops);
    sendJson(res, 200, { drop: publicTreasureDrop(drop) });
    return;
  }

  if (treasureDropMatch && req.method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const drops = readJsonFile(TREASURE_DROPS_FILE);
    const next = drops.filter((item) => item.id !== treasureDropMatch[1]);
    if (next.length === drops.length) {
      sendJson(res, 404, { error: "掉落不存在" });
      return;
    }
    writeJsonFile(TREASURE_DROPS_FILE, next);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/collections") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const form = await readMultipartForm(req, res);
    if (!form) return;
    const title = clean(form.fields.title);
    const link = clean(form.fields.link);
    if (!title || !link) {
      sendJson(res, 400, { error: "合集标题和超链接不能为空" });
      return;
    }

    const cover = form.files.cover;
    const coverFileName = cover && cover.data.length > 0
      ? saveUpload(cover.data, sanitizeFileName(cover.filename || "collection-cover"), COLLECTION_JACKET_UPLOAD_DIR)
      : "";
    const collections = readJsonFile(COLLECTIONS_FILE);
    const collection = {
      id: crypto.randomUUID(),
      title,
      link,
      coverFileName,
      createdBy: admin.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    collections.push(collection);
    writeJsonFile(COLLECTIONS_FILE, collections);
    sendJson(res, 201, { collection: publicCollection(collection) });
    return;
  }

  const collectionMatch = url.pathname.match(/^\/api\/admin\/collections\/([^/]+)$/);
  if (collectionMatch && req.method === "PATCH") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const form = await readMultipartForm(req, res);
    if (!form) return;
    const collections = readJsonFile(COLLECTIONS_FILE);
    const collection = collections.find((item) => item.id === collectionMatch[1]);
    if (!collection) {
      sendJson(res, 404, { error: "合集不存在" });
      return;
    }
    collection.title = clean(form.fields.title) || collection.title;
    collection.link = clean(form.fields.link) || collection.link;
    const cover = form.files.cover;
    if (cover && cover.data.length > 0) {
      collection.coverFileName = saveUpload(cover.data, sanitizeFileName(cover.filename || "collection-cover"), COLLECTION_JACKET_UPLOAD_DIR);
    }
    collection.updatedAt = new Date().toISOString();
    writeJsonFile(COLLECTIONS_FILE, collections);
    sendJson(res, 200, { collection: publicCollection(collection) });
    return;
  }

  if (collectionMatch && req.method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const collections = readJsonFile(COLLECTIONS_FILE);
    const next = collections.filter((item) => item.id !== collectionMatch[1]);
    if (next.length === collections.length) {
      sendJson(res, 404, { error: "合集不存在" });
      return;
    }
    writeJsonFile(COLLECTIONS_FILE, next);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/schedules") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    sendJson(res, 200, { schedules: readJsonFile(SCHEDULES_FILE).sort(sortTimelineItems).map(publicSchedule) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/schedules") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const schedule = buildSchedule(body);
    if (!schedule.ok) {
      sendJson(res, 400, { error: schedule.error });
      return;
    }
    const schedules = readJsonFile(SCHEDULES_FILE);
    const item = {
      id: crypto.randomUUID(),
      ...schedule.value,
      createdBy: admin.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    schedules.push(item);
    writeJsonFile(SCHEDULES_FILE, schedules);
    sendJson(res, 201, { schedule: publicSchedule(item) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/battles") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    sendJson(res, 200, { battles: readJsonFile(BATTLES_FILE).sort(sortTimelineItems).map(publicBattle) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/battles") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const form = await readFlexibleForm(req, res);
    if (!form) return;
    const battle = buildBattle(form.fields);
    if (!battle.ok) {
      sendJson(res, 400, { error: battle.error });
      return;
    }
    const battles = readJsonFile(BATTLES_FILE);
    const nextId = nextBattleId(battles);
    ensureBattleUploadDirs(nextId);
    const item = {
      id: nextId,
      abId: Number(nextId),
      ...battle.value,
      bannerFileName: form.files.banner?.data.length ? saveUpload(form.files.banner.data, sanitizeFileName(form.files.banner.filename || "battle-banner"), battleUploadDir(nextId, "banner")) : "",
      createdBy: admin.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const rules = saveBattleRulesFile(nextId, form.files.rules);
    if (!rules.ok) {
      sendJson(res, 400, { error: rules.error });
      return;
    }
    if (rules.fileName) {
      item.rulesFileName = rules.fileName;
      item.rulesOriginalFileName = rules.originalFileName;
    }
    battles.push(item);
    writeJsonFile(BATTLES_FILE, battles);
    sendJson(res, 201, { battle: publicBattle(item) });
    return;
  }

  const battleMatch = url.pathname.match(/^\/api\/admin\/battles\/([^/]+)$/);
  if (battleMatch && req.method === "PATCH") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const form = await readFlexibleForm(req, res);
    if (!form) return;
    const battle = buildBattle(form.fields);
    if (!battle.ok) {
      sendJson(res, 400, { error: battle.error });
      return;
    }
    const battles = readJsonFile(BATTLES_FILE);
    const item = battles.find((entry) => entry.id === battleMatch[1]);
    if (!item) {
      sendJson(res, 404, { error: "无名战不存在" });
      return;
    }
    Object.assign(item, battle.value, { updatedAt: new Date().toISOString() });
    ensureBattleUploadDirs(item.id);
    if (form.files.banner?.data.length) {
      item.bannerFileName = saveUpload(form.files.banner.data, sanitizeFileName(form.files.banner.filename || "battle-banner"), battleUploadDir(item.id, "banner"));
    }
    const rules = saveBattleRulesFile(item.id, form.files.rules);
    if (!rules.ok) {
      sendJson(res, 400, { error: rules.error });
      return;
    }
    if (rules.fileName) {
      item.rulesFileName = rules.fileName;
      item.rulesOriginalFileName = rules.originalFileName;
    }
    writeJsonFile(BATTLES_FILE, battles);
    sendJson(res, 200, { battle: publicBattle(item) });
    return;
  }

  if (battleMatch && req.method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const battles = readJsonFile(BATTLES_FILE);
    const next = battles.filter((item) => item.id !== battleMatch[1]);
    if (next.length === battles.length) {
      sendJson(res, 404, { error: "无名战不存在" });
      return;
    }
    writeJsonFile(BATTLES_FILE, next);
    sendJson(res, 200, { ok: true });
    return;
  }

  const scheduleMatch = url.pathname.match(/^\/api\/admin\/schedules\/([^/]+)$/);
  if (scheduleMatch && req.method === "PATCH") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const schedule = buildSchedule(body);
    if (!schedule.ok) {
      sendJson(res, 400, { error: schedule.error });
      return;
    }
    const schedules = readJsonFile(SCHEDULES_FILE);
    const item = schedules.find((entry) => entry.id === scheduleMatch[1]);
    if (!item) {
      sendJson(res, 404, { error: "日程项不存在" });
      return;
    }
    Object.assign(item, schedule.value, { updatedAt: new Date().toISOString() });
    writeJsonFile(SCHEDULES_FILE, schedules);
    sendJson(res, 200, { schedule: publicSchedule(item) });
    return;
  }

  if (scheduleMatch && req.method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const schedules = readJsonFile(SCHEDULES_FILE);
    const next = schedules.filter((item) => item.id !== scheduleMatch[1]);
    if (next.length === schedules.length) {
      sendJson(res, 404, { error: "日程项不存在" });
      return;
    }
    writeJsonFile(SCHEDULES_FILE, next);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/mapper-groups") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    sendJson(res, 200, { groups: readJsonFile(GROUPS_FILE).sort((a, b) => a.name.localeCompare(b.name, "zh-CN")).map(publicGroup) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const users = readJsonFile(USERS_FILE)
      .sort((a, b) => (a.chartName || a.username).localeCompare(b.chartName || b.username, "zh-CN"))
      .map(publicUser);
    sendJson(res, 200, { users });
    return;
  }

  const adminUserGroupMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/mapper-groups\/([^/]+)$/);
  if (adminUserGroupMatch && (req.method === "POST" || req.method === "DELETE")) {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const users = readJsonFile(USERS_FILE);
    const user = users.find((item) => item.id === adminUserGroupMatch[1] && (item.role || "user") === "user");
    const group = readJsonFile(GROUPS_FILE).find((item) => item.id === adminUserGroupMatch[2]);
    if (!user || !group) {
      sendJson(res, 404, { error: "用户或谱师组不存在" });
      return;
    }
    user.groupIds = user.groupIds || [];
    if (req.method === "POST" && !user.groupIds.includes(group.id)) user.groupIds.push(group.id);
    if (req.method === "DELETE") user.groupIds = user.groupIds.filter((id) => id !== group.id);
    writeJsonFile(USERS_FILE, users);
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/mapper-groups") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const name = clean(body.name);
    if (!name) {
      sendJson(res, 400, { error: "谱师组名称不能为空" });
      return;
    }
    const groups = readJsonFile(GROUPS_FILE);
    const group = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    groups.push(group);
    writeJsonFile(GROUPS_FILE, groups);
    sendJson(res, 201, { group: publicGroup(group) });
    return;
  }

  const groupMatch = url.pathname.match(/^\/api\/admin\/mapper-groups\/([^/]+)$/);
  if (groupMatch && req.method === "PATCH") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const groups = readJsonFile(GROUPS_FILE);
    const group = groups.find((item) => item.id === groupMatch[1]);
    if (!group) {
      sendJson(res, 404, { error: "谱师组不存在" });
      return;
    }
    group.name = clean(body.name) || group.name;
    group.updatedAt = new Date().toISOString();
    writeJsonFile(GROUPS_FILE, groups);
    sendJson(res, 200, { group: publicGroup(group) });
    return;
  }

  if (groupMatch && req.method === "DELETE") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const groups = readJsonFile(GROUPS_FILE);
    const next = groups.filter((item) => item.id !== groupMatch[1]);
    if (next.length === groups.length) {
      sendJson(res, 404, { error: "谱师组不存在" });
      return;
    }
    writeJsonFile(GROUPS_FILE, next);
    const users = readJsonFile(USERS_FILE);
    users.forEach((user) => {
      user.groupIds = (user.groupIds || []).filter((id) => id !== groupMatch[1]);
    });
    writeJsonFile(USERS_FILE, users);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "接口不存在" });
}

function buildSchedule(body) {
  const name = clean(body.name);
  const startTime = clean(body.startTime);
  const endTime = clean(body.endTime);
  const note = clean(body.note);
  if (!name || !startTime || !endTime) {
    return { ok: false, error: "区间名称、起始时间、结束时间不能为空" };
  }
  if (new Date(startTime).toString() === "Invalid Date" || new Date(endTime).toString() === "Invalid Date") {
    return { ok: false, error: "时间格式不正确" };
  }
  if (new Date(startTime).getTime() > new Date(endTime).getTime()) {
    return { ok: false, error: "起始时间不能晚于结束时间" };
  }
  return { ok: true, value: { name, startTime, endTime, note } };
}

function buildBattle(body) {
  const title = clean(body.title);
  const description = clean(body.description || body.note);
  const phaseTimes = normalizeBattlePhaseTimes(body);
  const allowedGroupId = clean(body.allowedGroupId);
  const validUserIds = new Set(readJsonFile(USERS_FILE).map((user) => user.id));
  const hostUserIds = parseJsonArray(body.hostUserIds).filter((id, index, all) => id && validUserIds.has(id) && all.indexOf(id) === index);
  const submissionLimits = {
    solo: normalizeSubmissionLimit(body.soloLimit),
    collab: normalizeSubmissionLimit(body.collabLimit),
    bonus: normalizeSubmissionLimit(body.bonusLimit)
  };
  const optionalChecks = buildOptionalChecks(body);
  const settingLocks = buildSettingLocks(body);
  const divisionMode = clean(body.divisionMode) === "custom" ? "custom" : "standard";
  const customDivisions = divisionMode === "custom" ? normalizeCustomDivisions(body.customDivisions) : [];
  if (!title || !phaseTimes.ok) {
    return { ok: false, error: !title ? "无名战标题不能为空" : phaseTimes.error };
  }
  if (!hostUserIds.length) {
    return { ok: false, error: "主催不能为空" };
  }
  if (Object.values(submissionLimits).some((value) => value !== "" && value < 0)) {
    return { ok: false, error: "投稿数量限制不能小于 0" };
  }
  if (customDivisions.some((division) => division.limit !== "" && division.limit < 0)) {
    return { ok: false, error: "投稿数量限制不能小于 0" };
  }
  if (optionalChecks.duration.min === -1 || optionalChecks.duration.max === -1) {
    return { ok: false, error: "曲目时长限制必须为非负数字" };
  }
  if (!validDurationRange(optionalChecks.duration)) {
    return { ok: false, error: "曲目最短时长不能大于最长时长" };
  }
  const difficultyValidation = validateDifficultyRange(optionalChecks.difficulty);
  if (!difficultyValidation.ok) {
    return { ok: false, error: difficultyValidation.error };
  }
  if (divisionMode === "custom" && !customDivisions.length) {
    return { ok: false, error: "自定义分组至少需要添加一个分组" };
  }
  const {
    writingStartTime,
    writingEndTime,
    packingStartTime,
    packingEndTime,
    snipingStartTime,
    snipingEndTime
  } = phaseTimes.value;
  return {
    ok: true,
    value: {
      title,
      description,
      note: description,
      writingStartTime,
      writingEndTime,
      packingStartTime,
      packingEndTime,
      snipingStartTime,
      snipingEndTime,
      allowedGroupId,
      hostUserIds,
      submissionLimits,
      optionalChecks,
      settingLocks,
      divisionMode,
      customDivisions,
      startTime: writingStartTime,
      endTime: snipingEndTime
    }
  };
}

function buildSettingLocks(body) {
  const legacyOptionalLock = clean(body.lockOptionalChecks) === "on" || clean(body.lockOptionalChecks) === "true";
  return {
    description: clean(body.lockDescription) === "on" || clean(body.lockDescription) === "true",
    banner: clean(body.lockBanner) === "on" || clean(body.lockBanner) === "true",
    rules: clean(body.lockRules) === "on" || clean(body.lockRules) === "true",
    optionalChecks: {
      duration: legacyOptionalLock || clean(body.lockDurationCheck) === "on" || clean(body.lockDurationCheck) === "true",
      difficulty: legacyOptionalLock || clean(body.lockDifficultyCheck) === "on" || clean(body.lockDifficultyCheck) === "true",
      noEternal: legacyOptionalLock || clean(body.lockNoEternalCheck) === "on" || clean(body.lockNoEternalCheck) === "true",
      affTypeCheck: legacyOptionalLock || clean(body.lockAffTypeCheck) === "on" || clean(body.lockAffTypeCheck) === "true",
      aafAccNormalize: legacyOptionalLock || clean(body.lockAafAccNormalizeCheck) === "on" || clean(body.lockAafAccNormalizeCheck) === "true"
    }
  };
}

function normalizeSettingLocks(locks = {}) {
  const optional = locks && typeof locks === "object" ? locks.optionalChecks : false;
  const allOptional = optional === true;
  const optionalObject = optional && typeof optional === "object" ? optional : {};
  return {
    description: Boolean(locks?.description),
    banner: Boolean(locks?.banner),
    rules: Boolean(locks?.rules),
    optionalChecks: Object.fromEntries(OPTIONAL_CHECK_KEYS.map((key) => [key, allOptional || Boolean(optionalObject[key])]))
  };
}

function mergeOptionalChecksByLocks(current, incoming, locks = {}) {
  const affTypeLocked = Boolean(locks.affTypeCheck);
  return {
    duration: locks.duration ? current.duration : incoming.duration,
    difficulty: locks.difficulty ? current.difficulty : incoming.difficulty,
    noEternal: locks.noEternal ? current.noEternal : incoming.noEternal,
    affTypeCheck: affTypeLocked ? current.affTypeCheck : incoming.affTypeCheck,
    aafAccNormalize: locks.aafAccNormalize ? current.aafAccNormalize : incoming.aafAccNormalize,
    affSyntax: affTypeLocked ? current.affSyntax : incoming.affSyntax
  };
}

function buildHostBattleSettings(body, currentBattle) {
  const description = clean(body.description || body.note);
  const phaseTimes = normalizeBattlePhaseTimes(body);
  if (!phaseTimes.ok) return { ok: false, error: phaseTimes.error };
  const {
    writingStartTime,
    writingEndTime,
    packingStartTime,
    packingEndTime,
    snipingStartTime,
    snipingEndTime
  } = phaseTimes.value;
  const phaseError = validateHostPhaseTimes(currentBattle, { writingEndTime, packingEndTime, snipingEndTime });
  if (phaseError) return { ok: false, error: phaseError };
  return {
    ok: true,
    value: {
      description,
      note: description,
      writingStartTime,
      writingEndTime,
      packingStartTime,
      packingEndTime,
      snipingStartTime,
      snipingEndTime,
      startTime: writingStartTime,
      endTime: snipingEndTime
    }
  };
}

function normalizeBattlePhaseTimes(body) {
  const writingStartTime = clean(body.writingStartTime || body.startTime);
  const writingEndTime = clean(body.writingEndTime || body.endTime);
  const packingEndTime = clean(body.packingEndTime);
  const snipingEndTime = clean(body.snipingEndTime);
  const values = [writingStartTime, writingEndTime, packingEndTime, snipingEndTime];
  if (values.some((value) => !value)) {
    return { ok: false, error: "写谱开始、写谱结束、整理结束、狙击结束时间不能为空" };
  }
  if (values.some((value) => new Date(value).toString() === "Invalid Date")) {
    return { ok: false, error: "时间格式不正确" };
  }
  const times = values.map((value) => new Date(value).getTime());
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] < times[index - 1]) {
      return { ok: false, error: "阶段时间必须按写谱、整理、狙击顺序排列" };
    }
  }
  return {
    ok: true,
    value: {
      writingStartTime,
      writingEndTime,
      packingStartTime: writingEndTime,
      packingEndTime,
      snipingStartTime: packingEndTime,
      snipingEndTime
    }
  };
}

function validateHostPhaseTimes(currentBattle, nextTimes) {
  const now = Date.now();
  const current = getBattleTimes(currentBattle);
  const endedPhases = [
    ["writingEndTime", "写谱阶段"],
    ["packingEndTime", "整理阶段"],
    ["snipingEndTime", "狙击阶段"]
  ];
  const reopened = endedPhases.find(([field]) => new Date(current[field]).getTime() < now && new Date(nextTimes[field]).getTime() >= now);
  return reopened ? `主催不能使已结束的${reopened[1]}重新开始` : "";
}

function normalizeSubmissionLimit(value) {
  const text = clean(value);
  if (!text) return "";
  const number = Number(text);
  return Number.isInteger(number) && number >= 0 ? number : -1;
}

function buildOptionalChecks(body) {
  const min = normalizeOptionalSeconds(body.durationMin);
  const max = normalizeOptionalSeconds(body.durationMax);
  return {
    duration: {
      enabled: clean(body.durationEnabled) === "on" || clean(body.durationEnabled) === "true",
      min,
      max
    },
    difficulty: {
      enabled: clean(body.difficultyEnabled) === "on" || clean(body.difficultyEnabled) === "true",
      min: clean(body.difficultyMin),
      max: clean(body.difficultyMax)
    },
    noEternal: clean(body.noEternal) === "on" || clean(body.noEternal) === "true",
    affTypeCheck: clean(body.affTypeCheck) === "on" || clean(body.affTypeCheck) === "true",
    aafAccNormalize: clean(body.aafAccNormalize) === "on" || clean(body.aafAccNormalize) === "true",
    affSyntax: buildAffSyntaxChecks(body)
  };
}

function buildAffSyntaxChecks(body) {
  return {
    allowGreenSnake: clean(body.affAllowGreenSnake) === "on" || clean(body.affAllowGreenSnake) === "true",
    allowGraySnake: clean(body.affAllowGraySnake) === "on" || clean(body.affAllowGraySnake) === "true",
    allowSpecialHitsound: clean(body.affAllowSpecialHitsound) === "on" || clean(body.affAllowSpecialHitsound) === "true",
    allowDesignantRedLine: clean(body.affAllowDesignantRedLine) === "on" || clean(body.affAllowDesignantRedLine) === "true",
    allowSmoothness: clean(body.affAllowSmoothness) === "on" || clean(body.affAllowSmoothness) === "true",
    allowFloatTapHold: clean(body.affAllowFloatTapHold) === "on" || clean(body.affAllowFloatTapHold) === "true",
    allowSizeKey: clean(body.affAllowSizeKey) === "on" || clean(body.affAllowSizeKey) === "true",
    allowCamera: clean(body.affAllowCamera) === "on" || clean(body.affAllowCamera) === "true",
    allowTrackHideShow: clean(body.affAllowTrackHideShow) === "on" || clean(body.affAllowTrackHideShow) === "true",
    allowTrackDisplay: clean(body.affAllowTrackDisplay) === "on" || clean(body.affAllowTrackDisplay) === "true",
    allowArcahvEffects: clean(body.affAllowArcahvEffects) === "on" || clean(body.affAllowArcahvEffects) === "true",
    allowHideGroup: clean(body.affAllowHideGroup) === "on" || clean(body.affAllowHideGroup) === "true",
    allowSixK: clean(body.affAllowSixK) === "on" || clean(body.affAllowSixK) === "true",
    allowNoInput: clean(body.affAllowNoInput) === "on" || clean(body.affAllowNoInput) === "true",
    allowAngle: clean(body.affAllowAngle) === "on" || clean(body.affAllowAngle) === "true",
    allowFadingHolds: clean(body.affAllowFadingHolds) === "on" || clean(body.affAllowFadingHolds) === "true"
  };
}

function normalizeOptionalSeconds(value) {
  const text = clean(value);
  if (!text) return "";
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : -1;
}

function normalizeOptionalChecks(checks = {}) {
  const duration = checks.duration || {};
  const difficulty = checks.difficulty || {};
  return {
    duration: {
      enabled: Boolean(duration.enabled),
      min: duration.min ?? "",
      max: duration.max ?? ""
    },
    difficulty: {
      enabled: Boolean(difficulty.enabled),
      min: clean(difficulty.min),
      max: clean(difficulty.max)
    },
    noEternal: Boolean(checks.noEternal),
    affTypeCheck: Boolean(checks.affTypeCheck),
    aafAccNormalize: Boolean(checks.aafAccNormalize),
    affSyntax: normalizeAffSyntaxChecks(checks.affSyntax)
  };
}

function normalizeAffSyntaxChecks(checks = {}) {
  return {
    allowGreenSnake: Boolean(checks.allowGreenSnake),
    allowGraySnake: Boolean(checks.allowGraySnake),
    allowSpecialHitsound: Boolean(checks.allowSpecialHitsound),
    allowDesignantRedLine: Boolean(checks.allowDesignantRedLine),
    allowSmoothness: Boolean(checks.allowSmoothness),
    allowFloatTapHold: Boolean(checks.allowFloatTapHold),
    allowSizeKey: Boolean(checks.allowSizeKey),
    allowCamera: Boolean(checks.allowCamera),
    allowTrackHideShow: Boolean(checks.allowTrackHideShow),
    allowTrackDisplay: Boolean(checks.allowTrackDisplay),
    allowArcahvEffects: Boolean(checks.allowArcahvEffects),
    allowHideGroup: Boolean(checks.allowHideGroup),
    allowSixK: Boolean(checks.allowSixK),
    allowNoInput: Boolean(checks.allowNoInput),
    allowAngle: Boolean(checks.allowAngle),
    allowFadingHolds: Boolean(checks.allowFadingHolds)
  };
}

function optionalCheckDescriptions(checks = {}) {
  return optionalCheckDetails(checks).map((item) => item.label);
}

function optionalCheckDetails(checks = {}) {
  const normalized = normalizeOptionalChecks(checks);
  const details = [];
  if (normalized.duration.enabled) {
    const min = normalized.duration.min === "" ? "不限" : `${normalized.duration.min}s`;
    const max = normalized.duration.max === "" ? "不限" : `${normalized.duration.max}s`;
    details.push({ label: `曲目时长限制：${min} - ${max}`, description: "参赛谱面的曲目时长需要在此区间内（误差不超过1s）。", type: "bonusExcluded" });
  }
  if (normalized.difficulty.enabled) {
    details.push({ label: `难度范围限制：${normalized.difficulty.min || "不限"} - ${normalized.difficulty.max || "不限"}`, description: "参赛谱面的难度需要在此区间内。", type: "bonusExcluded" });
  }
  if (normalized.noEternal) details.push({ label: "不启用Eternal难度", description: "参赛谱面的难度不得为Eternal。" });
  if (normalized.affTypeCheck) details.push({ label: "AFF语句类型检查", description: "参赛谱面中部分AFF语句不能使用，详情请查看规则文档", type: "bonusExcluded" });
  if (normalized.aafAccNormalize) details.push({ label: "AAF / ACC标准化检查", description: "AAF / ACC标准化检查" });
  return details;
}

function validDurationRange(duration) {
  if (!duration || duration.min === "" || duration.max === "") return true;
  return Number(duration.min) <= Number(duration.max);
}

function validateDifficultyRange(difficulty) {
  if (!difficulty || !difficulty.enabled) return { ok: true };
  if ((difficulty.min && difficultyRank(difficulty.min) === null) || (difficulty.max && difficultyRank(difficulty.max) === null)) {
    return { ok: false, error: "难度下限不能高于难度上限" };
  }
  if (!difficulty.min || !difficulty.max) return { ok: true };
  const min = difficultyRank(difficulty.min);
  const max = difficultyRank(difficulty.max);
  return min <= max ? { ok: true } : { ok: false, error: "难度下限不能高于难度上限" };
}

function difficultyRank(value) {
  const match = clean(value).match(/^(\d+)(\+)?$/);
  if (!match) return null;
  return Number(match[1]) * 2 + (match[2] ? 1 : 0);
}

function normalizeCustomDivisions(value) {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value || "[]"); } catch { parsed = []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item, index) => {
    const name = clean(item.name);
    if (!name) return null;
    const id = clean(item.id) || `custom_${index}_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const canCollaborate = Boolean(item.canCollaborate);
    const collaborationMode = canCollaborate && item.collaborationMode === "multi" ? "multi" : canCollaborate ? "duo" : "none";
    const minCollaborators = canCollaborate && (item.minCollaborators === 1 || item.minCollaborators === "1" || item.minCollaborators === true) ? 1 : 0;
    return {
      id,
      name,
      description: clean(item.description),
      canCollaborate,
      collaborationMode,
      minCollaborators,
      limit: normalizeSubmissionLimit(item.limit)
    };
  }).filter(Boolean);
}

function standardDivisions() {
  return [
    { id: "solo", name: "个人", canCollaborate: false, collaborationMode: "none", limit: "" },
    { id: "collab", name: "合作", canCollaborate: true, collaborationMode: "duo", limit: "" },
    { id: "bonus", name: "Bonus", canCollaborate: true, collaborationMode: "multi", minCollaborators: 1, limit: "" }
  ];
}

function battleDivisions(battle) {
  if (battle?.divisionMode === "custom") return normalizeCustomDivisions(battle.customDivisions);
  const limits = battle?.submissionLimits || {};
  return standardDivisions().map((division) => ({ ...division, limit: limits[division.id] ?? "" }));
}

function divisionConfigForBattle(battle, divisionId) {
  return battleDivisions(battle).find((division) => division.id === divisionId);
}

function validateDivisionCollaborators(config, collaborators) {
  if (!config.canCollaborate && collaborators.length) return "该分组不允许选择合作对象";
  if (config.canCollaborate && Number(config.minCollaborators || 0) > collaborators.length) return config.id === "bonus" ? "Bonus 组需要至少选择一位合作对象" : "没有添加合作对象";
  if (config.collaborationMode === "duo" && collaborators.length !== 1) return "该分组需要选择一位合作对象";
  return "";
}

function isBonusSubmissionForOptionalChecks(submission, battle) {
  if (submission.division === "bonus") return true;
  if (battle?.divisionMode !== "custom") return false;
  const divisions = battleDivisions(battle);
  const hasBonusNamedDivision = divisions.some((division) => /bonus/i.test(division.name));
  return !hasBonusNamedDivision && Boolean(submission.bonusChart);
}
async function readMultipartForm(req, res) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.startsWith("multipart/form-data")) {
    sendJson(res, 415, { error: "请使用表单提交" });
    return null;
  }
  return parseMultipart(await readBody(req), contentType);
}

async function readFlexibleForm(req, res) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.startsWith("multipart/form-data")) {
    return readMultipartForm(req, res);
  }
  return { fields: await readJson(req), files: {} };
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const baseDir = url.pathname.startsWith("/uploads/") ? ROOT : PUBLIC_DIR;
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(baseDir, requestedPath));

  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeType(filePath) });
    res.end(data);
  });
}

function requireUser(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const session = sessions.get(token);
  if (!session) {
    sendJson(res, 401, { error: "请先登录" });
    return null;
  }

  const user = readJsonFile(USERS_FILE).find((item) => item.id === session.userId);
  if (!user) {
    sessions.delete(token);
    sendJson(res, 401, { error: "登录状态已失效" });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    sendJson(res, 403, { error: "需要管理员权限" });
    return null;
  }
  return user;
}

function requireBattleHost(req, res, battleId) {
  const user = requireUser(req, res);
  if (!user) return null;
  const battle = readJsonFile(BATTLES_FILE).find((item) => item.id === battleId);
  if (!battle) {
    sendJson(res, 404, { error: "无名战不存在" });
    return null;
  }
  if (!canHostBattle(user, battle)) {
    sendJson(res, 403, { error: "需要该无名战主催权限" });
    return null;
  }
  return { user, battle };
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, createdAt: Date.now() });
  return token;
}

function saveUpload(buffer, originalName, relativeDir = "") {
  const savedFileName = `${Date.now()}-${crypto.randomUUID()}-${originalName}`;
  const relativePath = relativeDir ? path.posix.join(toPosixPath(relativeDir), savedFileName) : savedFileName;
  const filePath = uploadPath(relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return relativePath;
}

function deleteSubmissionFile(submission) {
  if (submission.savedFileName) {
    const filePath = uploadPath(submission.savedFileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    submission.deletedFileName = submission.savedFileName;
    submission.savedFileName = "";
  }
  if (submission.thumbnailFileName) {
    const thumbnailPath = uploadPath(submission.thumbnailFileName);
    if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
    submission.deletedThumbnailFileName = submission.thumbnailFileName;
    submission.thumbnailFileName = "";
  }
  submission.fileDeletedAt = new Date().toISOString();
}

function uploadPath(relativePath) {
  const parts = toPosixPath(relativePath).split("/").filter(Boolean);
  return path.join(UPLOAD_DIR, ...parts);
}

function uploadUrl(relativePath) {
  return `/uploads/${toPosixPath(relativePath)}`;
}

function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function battleUploadDir(battleId, type) {
  return path.posix.join(BATTLE_UPLOAD_DIR, String(battleId), type);
}

function ensureBattleUploadDirs(battleId) {
  ["charts", "banner", "data", "temp"].forEach((name) => {
    fs.mkdirSync(uploadPath(battleUploadDir(battleId, name)), { recursive: true });
  });
}

function nextBattleId(battles) {
  const used = new Set(battles.map((battle) => Number(battle.id)).filter((value) => Number.isInteger(value) && value >= 0));
  let id = 0;
  while (used.has(id)) id += 1;
  return String(id);
}

function saveBattleRulesFile(battleId, file) {
  if (!file || !file.data || file.data.length === 0) return { ok: true, fileName: "", originalFileName: "" };
  const safeName = sanitizeFileName(file.filename || "rules.pdf");
  if (path.extname(safeName).toLowerCase() !== ".pdf") {
    return { ok: false, error: "规则文档仅支持 pdf 文件" };
  }
  return {
    ok: true,
    fileName: saveUpload(file.data, safeName, battleUploadDir(battleId, "data")),
    originalFileName: safeName
  };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    chartName: user.chartName || "",
    role: user.role || "user",
    avatarUrl: user.avatarFileName ? uploadUrl(user.avatarFileName) : "/assets/avatar-placeholder.svg",
    bilibili: user.bilibili || "",
    bio: user.bio || "",
    showSubmissions: Boolean(user.showSubmissions),
    hostedBattles: publicUserHostedBattles(user.id),
    groupIds: user.groupIds || [],
    createdAt: user.createdAt
  };
}

function publicSubmission(submission) {
  return {
    id: submission.id,
    type: submission.type || "result",
    division: submission.division || "",
    divisionName: submission.divisionName || "",
    battleId: submission.battleId || "",
    battleTitle: submission.battleTitle || submission.eventName || "",
    songId: submission.songId || "",
    bonusChart: Boolean(submission.bonusChart),
    songTitle: submission.songTitle || "",
    songArtist: submission.songArtist || "",
    thumbnailUrl: submission.thumbnailFileName ? uploadUrl(submission.thumbnailFileName) : "",
    notes: submission.notes,
    username: submission.username,
    chartName: submission.chartName,
    collaborators: submission.collaborators || [],
    originalFileName: submission.originalFileName,
    fileSize: submission.fileSize,
    status: submission.status || "pending",
    reviewNote: submission.reviewNote || "",
    reviewedBy: submission.reviewedBy || "",
    reviewedAt: submission.reviewedAt || "",
    canEdit: canModifySubmissionNow(submission),
    canWithdraw: canWithdrawSubmission(submission),
    withdrawnAt: submission.withdrawnAt || "",
    createdAt: submission.createdAt
  };
}

function adminSubmission(submission) {
  return {
    ...publicSubmission(submission),
    savedFileName: submission.savedFileName,
    fileUrl: submission.savedFileName ? uploadUrl(submission.savedFileName) : "",
    fileDeleted: Boolean(submission.fileDeletedAt || !submission.savedFileName)
  };
}

function publicGroup(group) {
  return {
    id: group.id,
    name: group.name,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt
  };
}

function publicCollection(collection) {
  return {
    id: collection.id,
    title: collection.title,
    link: collection.link,
    coverUrl: collection.coverFileName ? uploadUrl(collection.coverFileName) : "/assets/collection-placeholder.svg",
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt
  };
}

function publicSchedule(schedule) {
  return {
    id: schedule.id,
    name: schedule.name,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    note: schedule.note || "",
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt
  };
}

function publicBattle(battle, user = null) {
  const times = getBattleTimes(battle);
  const phase = battlePhase(battle);
  const users = readJsonFile(USERS_FILE);
  const hostUserIds = Array.isArray(battle.hostUserIds) ? battle.hostUserIds : [];
  const limits = battle.submissionLimits || {};
  const groups = readJsonFile(GROUPS_FILE);
  const allowedGroupIds = battle.allowedGroupIds || (battle.allowedGroupId ? [battle.allowedGroupId] : []);
  const optionalChecks = normalizeOptionalChecks(battle.optionalChecks);
  const divisionMode = battle.divisionMode === "custom" ? "custom" : "standard";
  const customDivisions = normalizeCustomDivisions(battle.customDivisions);
  const submissionCount = countBattleSubmissions(battle.id, phase.kind);
  const finalSubmissionCount = countBattleSubmissions(battle.id, "final");
  return {
    id: battle.id,
    abId: battle.abId ?? Number(battle.id),
    title: battle.title,
    description: battle.description || battle.note || "",
    note: battle.description || battle.note || "",
    bannerUrl: battle.bannerFileName ? uploadUrl(battle.bannerFileName) : "/assets/battle-banner-placeholder.svg",
    hasRules: Boolean(battle.rulesFileName),
    rulesOriginalFileName: battle.rulesOriginalFileName || "",
    canDownloadRules: Boolean(user && canDownloadBattleRules(user, battle)),
    allowedGroupId: battle.allowedGroupId || "",
    allowedGroupIds,
    allowedGroupName: battle.allowedGroupId ? (groups.find((group) => group.id === battle.allowedGroupId)?.name || "") : "",
    allowedGroupNames: allowedGroupIds.map((id) => groups.find((group) => group.id === id)?.name || id),
    hostUserIds,
    hosts: hostUserIds.map((id) => {
      const host = users.find((item) => item.id === id);
      return {
        id,
        chartName: host?.chartName || host?.username || id,
        role: host?.role || "user",
        avatarUrl: host?.avatarFileName ? uploadUrl(host.avatarFileName) : "/assets/avatar-placeholder.svg"
      };
    }),
    submissionLimits: {
      solo: limits.solo ?? "",
      collab: limits.collab ?? "",
      bonus: limits.bonus ?? ""
    },
    optionalChecks,
    settingLocks: normalizeSettingLocks(battle.settingLocks),
    optionalCheckDescriptions: optionalCheckDescriptions(optionalChecks),
    optionalCheckDetails: optionalCheckDetails(optionalChecks),
    divisionMode,
    customDivisions,
    divisionOptions: battleDivisions(battle),
    userSubmissionCounts: user && user.role === "user" ? {
      solo: countUserDivisionSlots(user.id, battle.id, "solo"),
      collab: countUserDivisionSlots(user.id, battle.id, "collab"),
      bonus: countUserDivisionSlots(user.id, battle.id, "bonus"),
      ...Object.fromEntries(customDivisions.map((division) => [division.id, countUserDivisionSlots(user.id, battle.id, division.id)]))
    } : {},
    submissionCount,
    finalSubmissionCount,
    countLabel: phase.kind === "writing" ? "已提交谱面数量" : ["packing", "sniping", "ended"].includes(phase.kind) ? "参赛谱面数量" : "",
    canHost: Boolean(user && canHostBattle(user, battle)),
    writingStartTime: times.writingStartTime,
    writingEndTime: times.writingEndTime,
    packingStartTime: times.packingStartTime,
    packingEndTime: times.packingEndTime,
    snipingStartTime: times.snipingStartTime,
    snipingEndTime: times.snipingEndTime,
    startTime: times.writingStartTime,
    endTime: times.snipingEndTime,
    phase: phase.kind,
    phaseLabel: phase.label,
    phaseEndsAt: phase.endsAt,
    createdAt: battle.createdAt,
    updatedAt: battle.updatedAt
  };
}

function publicBattleSubmission(submission, showMapper) {
  return {
    id: submission.id,
    songId: submission.songId,
    songTitle: submission.songTitle || "",
    songArtist: submission.songArtist || "",
    thumbnailUrl: submission.thumbnailFileName ? uploadUrl(submission.thumbnailFileName) : "/assets/collection-placeholder.svg",
    division: submission.division,
    divisionName: submission.divisionName || "",
    chartName: showMapper ? submission.chartName : "",
    collaborators: showMapper ? (submission.collaborators || []).map((item) => ({ chartName: item.chartName })) : [],
    fileSize: submission.fileSize,
    createdAt: submission.createdAt
  };
}

function publicTreasureDrop(drop) {
  if (!drop) return null;
  return {
    id: drop.id,
    name: drop.name,
    probability: Number(drop.probability || 0),
    imageUrl: drop.imageUrl || (drop.imageFileName ? uploadUrl(drop.imageFileName) : drop.assetUrl),
    createdAt: drop.createdAt,
    updatedAt: drop.updatedAt
  };
}

function publicCode(code) {
  return {
    id: code.id,
    code: code.code,
    createdAt: code.createdAt,
    expiresAt: code.expiresAt,
    usedAt: code.usedAt,
    invalidatedAt: code.invalidatedAt,
    status: codeStatus(code)
  };
}

function codeStatus(code) {
  if (code.usedAt) return "used";
  if (code.invalidatedAt) return "invalidated";
  if (new Date(code.expiresAt).getTime() <= Date.now()) return "expired";
  return "active";
}

function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function readJson(req) {
  return readBody(req).then((buffer) => {
    if (!buffer.length) return {};
    return JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, ""));
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return { fields: {}, files: {} };

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const body = buffer.toString("latin1");
  const fields = {};
  const files = {};

  body.split(boundary).forEach((part) => {
    if (!part || part === "--\r\n" || part === "--") return;
    const separatorIndex = part.indexOf("\r\n\r\n");
    if (separatorIndex === -1) return;

    const rawHeaders = part.slice(0, separatorIndex);
    let content = part.slice(separatorIndex + 4);
    if (content.endsWith("\r\n")) content = content.slice(0, -2);
    if (content.endsWith("--")) content = content.slice(0, -2);

    const disposition = rawHeaders.match(/content-disposition:[^\r\n]+/i);
    if (!disposition) return;

    const name = getHeaderValue(disposition[0], "name");
    const filename = getHeaderValue(disposition[0], "filename");
    if (!name) return;

    if (filename !== null) {
      files[name] = { filename, data: Buffer.from(content, "latin1") };
    } else {
      fields[name] = Buffer.from(content, "latin1").toString("utf8");
    }
  });

  return { fields, files };
}

function getHeaderValue(header, key) {
  const match = header.match(new RegExp(`${key}="([^"]*)"`, "i"));
  return match ? match[1] : null;
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJsonFile(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function clean(value) {
  return String(value || "").trim();
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function parseChartSubmissionForm(form, user, options = {}) {
  const division = clean(form.fields.division);
  const battleId = clean(form.fields.battleId);
  const songId = clean(form.fields.songId);
  const notes = clean(form.fields.notes);
  const bonusChart = clean(form.fields.bonusChart) === "on" || clean(form.fields.bonusChart) === "true";
  const collaboratorIds = parseJsonArray(form.fields.collaborators);
  if (!battleId || !songId) {
    return { ok: false, error: "欲参加的无名战和 songid 不能为空" };
  }
  if (!/^[a-z0-9_]+$/.test(songId)) {
    return { ok: false, error: "songid 仅能包含小写字母、阿拉伯数字与下划线" };
  }
  const battle = options.allowModify ? findBattleAcceptingModification(battleId, options.currentSubmission) : findSubmittableBattle(battleId);
  if (!battle) {
    return { ok: false, error: "所选无名战不在提交时间内" };
  }
  if (!canUserAccessBattle(user, battle)) {
    return { ok: false, error: "不在要求的谱师组中" };
  }
  const divisionConfig = divisionConfigForBattle(battle, division);
  if (!divisionConfig) {
    return { ok: false, error: "请选择参赛组别" };
  }
  const users = readJsonFile(USERS_FILE);
  const collaborators = collaboratorIds
    .filter((id, index, all) => id && id !== user.id && all.indexOf(id) === index)
    .map((id) => users.find((item) => item.id === id && item.role === "user" && canUserAccessBattle(item, battle)))
    .filter(Boolean)
    .map((item) => ({ userId: item.id, username: item.username, chartName: item.chartName, status: "pending", respondedAt: "" }));
  const collaborationError = validateDivisionCollaborators(divisionConfig, collaborators);
  if (collaborationError) {
    return { ok: false, error: collaborationError };
  }
  const chartFile = form.files.chartFile;
  if (!chartFile || chartFile.data.length === 0) {
    return { ok: false, error: "请上传谱面 zip 文件" };
  }
  if (chartFile.data.length > MAX_CHART_ZIP_SIZE) {
    return { ok: false, error: "谱面压缩包过大（超过12.8MB）", autoCheckErrors: ["谱面压缩包过大（超过12.8MB）"] };
  }
  const safeName = sanitizeFileName(chartFile.filename || "chart.zip");
  if (path.extname(safeName).toLowerCase() !== ".zip") {
    return { ok: false, error: "谱面文件必须为 zip 文件" };
  }
  return { ok: true, division, battle, songId, notes, collaborators, chartFile, safeName, bonusChart };
}

const legacyAutoCheckRules = [
  {
    name: "zip-file-name",
    check: ({ submission }) => (
      path.basename(submission.originalFileName, path.extname(submission.originalFileName)) === submission.songId
        ? []
        : ["压缩包命名与songid不一致"]
    )
  },
  {
    name: "required-zip-entries",
    check: ({ entries }) => {
      const normalized = new Set(entries.map((entry) => entry.replace(/\\/g, "/").split("/").pop()));
      return [
        ["songlist.json", "songlist.json缺失"],
        ["base.jpg", "base.jpg缺失"],
        ["base_256.jpg", "base_256.jpg缺失"]
      ].filter(([file]) => !normalized.has(file)).map(([, message]) => message);
    }
  }
];

function legacyApplyAutoCheck(submission, zipBuffer) {
  const entries = listZipEntries(zipBuffer);
  const failures = autoCheckRules.flatMap((rule) => rule.check({ submission, entries, zipBuffer }));
  if (failures.length) {
    return { ok: false, errors: failures };
  }
  submission.status = (submission.collaborators || []).length ? "waiting_collaboration" : "pending";
  submission.reviewNote = "";
  submission.reviewedBy = "";
  submission.reviewedAt = "";
  return { ok: true, errors: [] };
}

function legacyListZipEntries(buffer) {
  const entries = [];
  for (let index = 0; index <= buffer.length - 46; index += 1) {
    if (buffer.readUInt32LE(index) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(index + 28);
    const extraLength = buffer.readUInt16LE(index + 30);
    const commentLength = buffer.readUInt16LE(index + 32);
    const nameStart = index + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;
    entries.push(buffer.slice(nameStart, nameEnd).toString("utf8"));
    index = nameEnd + extraLength + commentLength - 1;
  }
  return entries;
}

const autoCheckRules = [
  {
    name: "zip-file-name",
    check: ({ submission }) => (
      path.basename(submission.originalFileName, path.extname(submission.originalFileName)) === submission.songId
        ? []
        : ["压缩包命名与songid不一致"]
    )
  },
  {
    name: "required-zip-entries",
    check: ({ entries, songlistResult }) => {
      const normalized = new Set(entries.map((entry) => entry.replace(/\\/g, "/").split("/").pop()));
      const failures = [
        ["base.jpg", "base.jpg缺失"],
        ["base_256.jpg", "base_256.jpg缺失"],
        ["base.ogg", "base.ogg缺失"]
      ].filter(([file]) => !normalized.has(file)).map(([, message]) => message);
      if (!songlistResult.entry) failures.unshift("songlist缺失");
      else if (!songlistResult.ok) failures.unshift("songlist解析失败");
      return failures;
    }
  },
  {
    name: "songlist-content",
    check: ({ submission, zipEntries, songlistResult }) => (
      songlistResult.ok ? songlistBasicAutoCheckFailures(submission, songlistResult.value) : []
    )
  },
  {
    name: "base-image-format-and-size",
    check: ({ zipEntries }) => {
      const failures = [];
      const base = findZipEntryByBaseName(zipEntries, "base.jpg");
      if (base) {
        if (!isJpeg(base.data)) {
          failures.push("base.jpg的格式不为jpg，请不要直接修改文件后缀");
        } else if (!hasJpegSize(base.data, 512, 512)) {
          failures.push("base.jpg的图片大小不为512*512");
        }
      }
      const base256 = findZipEntryByBaseName(zipEntries, "base_256.jpg");
      if (base256) {
        if (!isJpeg(base256.data)) {
          failures.push("base_256.jpg的格式不为jpg，请不要直接修改文件后缀");
        } else if (!hasJpegSize(base256.data, 256, 256)) {
          failures.push("base.jpg的图片大小不为256*256");
        }
      }
      return failures;
    }
  },
  {
    name: "base-audio-format",
    check: ({ zipEntries }) => {
      const baseOgg = findZipEntryByBaseName(zipEntries, "base.ogg");
      if (!baseOgg) return [];
      return isOgg(baseOgg.data) ? [] : ["base.ogg的格式不为ogg，请不要直接修改文件后缀"];
    }
  }
];

function applyAutoCheck(submission, zipBuffer) {
  if (!isZipArchive(zipBuffer)) {
    return { ok: false, errors: ["提交的文件不为.zip压缩包"] };
  }
  let zipEntries = [];
  try {
    zipEntries = readZipEntries(zipBuffer);
  } catch {
    return { ok: false, errors: ["提交的文件不为.zip压缩包"] };
  }
  if (!zipEntries.length) return { ok: false, errors: ["提交的文件不为.zip压缩包"] };
  const entries = zipEntries.map((entry) => entry.name);
  const songlistResult = parseSonglistEntry(zipEntries);
  const affParseResult = parseAffFilesFromZip(zipEntries);
  const failures = autoCheckRules.flatMap((rule) => rule.check({ submission, entries, zipEntries, zipBuffer, songlistResult, affParseResult }));
  const battle = readJsonFile(BATTLES_FILE).find((item) => item.id === submission.battleId);
  if (battle) {
    failures.push(...runOptionalAutoChecks(battle, zipEntries, songlistResult.ok ? songlistResult.value : null, submission, affParseResult));
  }
  const metadata = extractChartMetadata(zipEntries, songlistResult);
  if (!metadata.ok && !failures.includes(metadata.error)) failures.push(metadata.error);
  if (failures.length) {
    return { ok: false, errors: failures };
  }
  submission.songTitle = metadata.songTitle;
  submission.songArtist = metadata.songArtist;
  submission.thumbnailFileName = saveUpload(metadata.thumbnailData, `${submission.songId}-base_256.jpg`, battleUploadDir(submission.battleId, "data"));
  submission.status = (submission.collaborators || []).length ? "waiting_collaboration" : "pending";
  submission.reviewNote = "";
  submission.reviewedBy = "";
  submission.reviewedAt = "";
  return { ok: true, errors: [] };
}

function isZipArchive(buffer) {
  if (!buffer || buffer.length < 4) return false;
  const signature = buffer.readUInt32LE(0);
  return signature === 0x04034b50 || signature === 0x06054b50 || signature === 0x08074b50;
}

function parseSonglistEntry(zipEntries) {
  const entry = findSonglistEntry(zipEntries);
  if (!entry) return { ok: false, entry: null, value: null, error: "songlist缺失" };
  try {
    return { ok: true, entry, value: JSON.parse(entry.data.toString("utf8").replace(/^\uFEFF/, "")), error: "" };
  } catch {
    return { ok: false, entry, value: null, error: "songlist解析失败" };
  }
}

function findSonglistEntry(zipEntries) {
  return findZipEntryByBaseName(zipEntries, "songlist.json") || findZipEntryByBaseName(zipEntries, "songlist");
}

function songlistBasicAutoCheckFailures(submission, songlist) {
  const failures = [];
  if (clean(songlist.id) !== submission.songId) {
    failures.push("SONGLIST: 填写的songid与id不一致");
  }
  return failures;
}

function songlistAafAccFailures(submission, zipEntries, songlist, affParseResult = null) {
  const failures = [];
  failures.push(...songlistBgFailures(songlist, zipEntries, { checkSize: true }));
  const difficulties = Array.isArray(songlist.difficulties) ? songlist.difficulties : [];
  if (difficulties.some((item) => Number(item.ratingClass) === 3) && difficulties.some((item) => Number(item.ratingClass) === 4)) {
    failures.push("SONGLIST: 同时存在Beyond难度与Eternal难度");
  }
  const validCompetitionDifficulties = competitionDifficulties(songlist).filter((item) => Number(item.rating) !== -1);
  if (!submission.bonusChart && !validCompetitionDifficulties.length) {
    failures.push("SONGLIST: 不存在有效参赛难度");
  }
  const chartDifficulties = difficulties.filter((item) => Number(item.rating) !== -1);
  if (chartDifficulties.some((item) => !findZipEntryByBaseName(zipEntries, `${Number(item.ratingClass)}.aff`))) {
    failures.push("SONGLIST: 存在难度没有对应谱面文件");
  }
  failures.push(...specialAudioFailures(zipEntries));
  failures.push(...affStandardizationFailures(affParseResult, zipEntries));
  return failures;
}

function specialAudioFailures(zipEntries) {
  const wavEntries = zipEntries.filter((entry) => zipBaseName(entry.name).toLowerCase().endsWith(".wav"));
  if (!wavEntries.length) return [];
  const failures = [];
  if (wavEntries.some((entry) => !isWav(entry.data))) {
    failures.push("存在特殊天键音效不为.wav格式文件");
  }
  if (wavEntries.some((entry) => /^[0-9]/.test(zipBaseName(entry.name)))) {
    failures.push("特殊天键音效文件的文件名不得以数字开头");
  }
  return failures;
}

function affStandardizationFailures(affParseResult, zipEntries) {
  const files = Array.isArray(affParseResult?.files) ? affParseResult.files : [];
  if (!files.length) return [];
  const failures = new Set();
  const wavFiles = new Set(
    zipEntries
      .filter((entry) => zipBaseName(entry.name).toLowerCase().endsWith(".wav"))
      .map((entry) => zipBaseName(entry.name).toLowerCase())
  );
  files.forEach((file) => {
    const tpdf = Number(file.timingPointDensityFactor);
    if (Number.isFinite(tpdf) && (tpdf > 2 || tpdf < 0.5)) {
      failures.add("TPDF值不在0.5~2.0的范围内");
    }
    walkAffStatements(file.statements || [], (statement) => {
      if (statement.type === "hold" && isFiniteAffNumber(statement.startTime) && isFiniteAffNumber(statement.endTime) && Number(statement.endTime) <= Number(statement.startTime)) {
        failures.add("谱面文件中存在持续时间小于等于0的Hold物件");
      }
      if (statement.type === "arc") {
        const hasZeroDuration = isFiniteAffNumber(statement.startTime) && isFiniteAffNumber(statement.endTime) && Number(statement.startTime) === Number(statement.endTime);
        const hasZeroXDisplacement = isFiniteAffNumber(statement.x1) && isFiniteAffNumber(statement.x2) && Number(statement.x1) === Number(statement.x2);
        const hasZeroYDisplacement = isFiniteAffNumber(statement.y1) && isFiniteAffNumber(statement.y2) && Number(statement.y1) === Number(statement.y2);
        if (hasZeroDuration && hasZeroXDisplacement && hasZeroYDisplacement) {
          failures.add("谱面文件中存在持续时间为0ms且位移为0的Arc物件");
        }
        (Array.isArray(statement.arctaps) ? statement.arctaps : []).forEach((arctap) => {
          const time = Number(arctap.time);
          if (Number.isFinite(time) && isFiniteAffNumber(statement.startTime) && isFiniteAffNumber(statement.endTime) && time >= Number(statement.startTime) && time <= Number(statement.endTime)) return;
          if (Number.isFinite(time)) failures.add("谱面文件中存在Arctap不在对应Arc的持续时间内");
        });
        const hitsound = clean(statement.hitsound).toLowerCase();
        if (hitsound && hitsound !== "none") {
          const expectedWav = expectedAffHitsoundWavName(hitsound);
          if (expectedWav && !wavFiles.has(expectedWav)) {
            failures.add("谱面文件中存在特殊天键缺失对应的音效文件");
          }
        }
      }
      if (statement.type === "flick") {
        failures.add("谱面文件中包含已经弃用的Flick物件");
      }
      if (statement.type === "timing" && Number(statement.beats) === 0) {
        failures.add("存在beats为0的timing语句");
      }
    });
  });
  return Array.from(failures);
}

function isFiniteAffNumber(value) {
  const number = Number(value);
  return Number.isFinite(number);
}

function expectedAffHitsoundWavName(hitsound) {
  const text = clean(hitsound).toLowerCase();
  if (!text || text === "none") return "";
  if (text.endsWith(".wav")) return text;
  if (text.endsWith("_wav")) return `${text.slice(0, -4)}.wav`;
  return `${text}.wav`;
}

function songlistBgFailures(songlist, zipEntries, options = {}) {
  const bg = clean(songlist.bg);
  if (!bg) return ["SONGLIST: bg填写有误或自定义bg图片不存在"];
  const existing = new Set(readJsonFile(BGS_FILE).map((item) => clean(item.name).toLowerCase()));
  if (existing.has(bg.toLowerCase())) return [];
  const customBg = findZipEntryByBaseName(zipEntries, `${bg}.jpg`);
  if (!customBg) return ["SONGLIST: bg填写有误或自定义bg图片不存在"];
  if (!isJpeg(customBg.data)) return ["SONGLIST: 提供的自定义bg文件格式不为jpg"];
  if (options.checkSize && !hasJpegSize(customBg.data, 1920, 1440)) return ["自定义bg的大小不为1920*1440"];
  return [];
}

function competitionDifficulties(songlist) {
  return (Array.isArray(songlist?.difficulties) ? songlist.difficulties : [])
    .filter((item) => Number(item.ratingClass) >= 2);
}

function songlistHasDifficultyClass(songlist, ratingClass) {
  return (Array.isArray(songlist?.difficulties) ? songlist.difficulties : [])
    .some((item) => Number(item.ratingClass) === ratingClass);
}

function songlistDifficultyText(item) {
  const rating = Number(item.rating);
  if (!Number.isFinite(rating) || rating < 0) return "";
  return `${rating}${item.ratingPlus ? "+" : ""}`;
}

function runOptionalAutoChecks(battle, zipEntries, songlist = null, submission = {}, affParseResult = null) {
  const checks = normalizeOptionalChecks(battle.optionalChecks);
  const failures = [];
  const skipBonusExcluded = isBonusSubmissionForOptionalChecks(submission, battle);
  if (checks.duration.enabled && !skipBonusExcluded) {
    const baseOgg = findZipEntryByBaseName(zipEntries, "base.ogg");
    if (baseOgg) {
      const duration = getOggDurationSeconds(baseOgg.data);
      const min = checks.duration.min === "" ? null : Number(checks.duration.min);
      const max = checks.duration.max === "" ? null : Number(checks.duration.max);
      if (duration === null || (min !== null && duration < min - 1) || (max !== null && duration > max + 1)) {
        failures.push("曲目时长不满足赛事要求");
      }
    }
  }
  if (checks.difficulty.enabled && songlist && !skipBonusExcluded) {
    const difficulties = competitionDifficulties(songlist).filter((item) => Number(item.rating) !== -1);
    const min = checks.difficulty.min ? difficultyRank(checks.difficulty.min) : null;
    const max = checks.difficulty.max ? difficultyRank(checks.difficulty.max) : null;
    const hasMatchingDifficulty = difficulties.some((item) => {
      const rank = difficultyRank(songlistDifficultyText(item));
      return rank !== null && (min === null || rank >= min) && (max === null || rank <= max);
    });
    if (difficulties.length && !hasMatchingDifficulty) {
      failures.push("谱面难度不满足赛事要求");
    }
  }
  if (checks.noEternal && songlistHasDifficultyClass(songlist, 4)) {
    failures.push("该无名战不支持使用Eternal难度");
  }
  if (checks.aafAccNormalize && songlist) {
    failures.push(...songlistAafAccFailures(submission, zipEntries, songlist, affParseResult));
  }
  if (checks.affTypeCheck && !skipBonusExcluded) {
    failures.push(...affSyntaxFailures(affParseResult, checks.affSyntax));
  }
  return failures;
}

function extractChartMetadata(zipEntries, songlistResult = null) {
  const thumbnail = findZipEntryByBaseName(zipEntries, "base_256.jpg");
  if (!songlistResult?.ok || !thumbnail) {
    return { ok: true, songTitle: "", songArtist: "", thumbnailData: Buffer.alloc(0) };
  }
  try {
    const parsed = songlistResult.value;
    return {
      ok: true,
      songTitle: clean(parsed.title_localized?.en || parsed.title || parsed.id || ""),
      songArtist: clean(parsed.artist || ""),
      thumbnailData: thumbnail.data
    };
  } catch {
    return { ok: false, error: "songlist解析失败" };
  }
}

function parseAffFilesFromZip(zipEntries) {
  const files = zipEntries.filter((entry) => zipBaseName(entry.name).toLowerCase().endsWith(".aff"));
  const parsed = [];
  const errors = [];
  files.forEach((entry) => {
    try {
      const result = parseAffFile(entry.data, { fileName: zipBaseName(entry.name) });
      parsed.push({ fileName: zipBaseName(entry.name), ...result });
      if (!result.ok) errors.push(`AFF: ${zipBaseName(entry.name)}解析失败`);
    } catch {
      parsed.push({ fileName: zipBaseName(entry.name), ok: false, statements: [], flatStatements: [], groups: [], stats: { total: 0 }, errors: ["AFF解析异常"] });
      errors.push(`AFF: ${zipBaseName(entry.name)}解析失败`);
    }
  });
  return { files: parsed, errors };
}

function affSyntaxFailures(affParseResult, allowedChecks = {}) {
  const checks = normalizeAffSyntaxChecks(allowedChecks);
  const failures = new Set();
  const files = Array.isArray(affParseResult?.files) ? affParseResult.files : [];
  files.forEach((file) => {
    scanAffRawText(file.rawText || "", checks, failures);
    walkAffStatements(file.statements || [], (statement) => {
      if (statement.type === "arc") {
        checkAffArcSyntax(statement, checks, failures);
        return;
      }
      if (statement.type === "camera" && !checks.allowCamera) {
        failures.add("AFF: 当前赛事禁止使用Camera");
        return;
      }
      if (statement.type === "scenecontrol") {
        checkAffSceneControlSyntax(statement, checks, failures);
        return;
      }
      if (statement.type === "timinggroup") {
        checkAffTimingGroupSyntax(statement, checks, failures);
      }
    });
  });
  return Array.from(failures);
}

function scanAffRawText(rawText, checks, failures) {
  const text = String(rawText || "");
  if (!checks.allowGreenSnake && /arc\s*\([^\)]*,\s*2,\s*true\s*(?:,|\))/i.test(text)) failures.add("AFF: 当前赛事禁止使用绿蛇");
  if (!checks.allowGraySnake && /arc\s*\([^\)]*,\s*3,\s*true\s*(?:,|\))/i.test(text)) failures.add("AFF: 当前赛事禁止使用灰蛇");
  if (!checks.allowSpecialHitsound && /arc\s*\([^\)]*,\s*(?!none\b)[^,]+,\s*[^)]*\)/i.test(text)) {
    // Fallback only; detailed validation still comes from parsed statements.
  }
  if (!checks.allowDesignantRedLine && /arc\s*\([^\)]*,\s*designant\s*(?:,|\))/i.test(text)) failures.add("AFF: 当前赛事禁止使用Designant红线");
  if (!checks.allowSmoothness && /arc\s*\([^)]*,[^)]*,[^)]*,[^)]*,[^)]*,[^)]*,[^)]*,[^)]*,[^)]*,[^)]*,\s*[^),]+\s*\)/i.test(text)) failures.add("AFF: 当前赛事禁止使用Arc平滑度");
  if (!checks.allowCamera && /camera\s*\(/i.test(text)) failures.add("AFF: 当前赛事禁止使用Camera");
  if (!checks.allowTrackHideShow && /scenecontrol\s*\(\s*[^,]+,\s*track(?:hide|show)\s*,/i.test(text)) failures.add("AFF: 当前赛事禁止使用trackhide/trackshow");
  if (!checks.allowTrackDisplay && /scenecontrol\s*\(\s*[^,]+,\s*trackdisplay\s*,/i.test(text)) failures.add("AFF: 当前赛事禁止使用trackdisplay");
  if (!checks.allowArcahvEffects && /scenecontrol\s*\(\s*[^,]+,\s*(?:redline|arcahvdistort|arcahvdebris)\s*,/i.test(text)) failures.add("AFF: 当前赛事禁止使用Arcahv相关scenecontrol效果");
  if (!checks.allowHideGroup && /scenecontrol\s*\(\s*[^,]+,\s*hidegroup\s*,/i.test(text)) failures.add("AFF: 当前赛事禁止使用hidegroup");
  if (!checks.allowSixK && /scenecontrol\s*\(\s*[^,]+,\s*(?:enwidenlanes|enwidencamera)\s*,/i.test(text)) failures.add("AFF: 当前赛事禁止使用6k");
  if (!checks.allowNoInput && /timinggroup\s*\([^)]*\bnoinput\b[^)]*\)/i.test(text)) failures.add("AFF: 当前赛事禁止使用noinput");
  if (!checks.allowAngle && /timinggroup\s*\([^)]*\b(?:anglex|angley)\b[^)]*\)/i.test(text)) failures.add("AFF: 当前赛事禁止使用angle");
  if (!checks.allowFadingHolds && /timinggroup\s*\([^)]*\bfadingholds\b[^)]*\)/i.test(text)) failures.add("AFF: 当前赛事禁止使用fadingholds");
  if (!checks.allowFloatTapHold && /\b(?:tap|hold)\s*\(\s*[^,]+,\s*[-+]?(?:\d+\.\d+|\d+\.\d*|\.\d+)\s*(?:\)|,)/i.test(text)) failures.add("AFF: 当前赛事禁止使用浮点Tap/Hold");
  if (!checks.allowSizeKey && /arc\s*\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*3\s*,/i.test(text) && /arc\s*\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*3\s*,/i.test(text)) {
    // Fallback kept intentionally narrow; parsed statement check handles the exact equality test.
  }
}

function walkAffStatements(statements, visit) {
  (Array.isArray(statements) ? statements : []).forEach((statement) => {
    visit(statement);
    if (statement.type === "timinggroup") {
      walkAffStatements(statement.statements || [], visit);
    }
  });
}

function checkAffArcSyntax(statement, checks, failures) {
  const arcType = clean(statement.arcType).toLowerCase();
  const hitsound = clean(statement.hitsound).toLowerCase();
  if (!checks.allowGreenSnake && Number(statement.color) === 2 && arcType === "true") failures.add("AFF: 当前赛事禁止使用绿蛇");
  if (!checks.allowGraySnake && Number(statement.color) === 3 && arcType === "true") failures.add("AFF: 当前赛事禁止使用灰蛇");
  if (!checks.allowSpecialHitsound && hitsound && hitsound !== "none") failures.add("AFF: 当前赛事禁止使用特殊天键");
  if (!checks.allowDesignantRedLine && arcType === "designant") failures.add("AFF: 当前赛事禁止使用Designant红线");
  if (!checks.allowSmoothness && Array.isArray(statement.args) && statement.args.length > 10 && clean(statement.args[10]) !== "") failures.add("AFF: 当前赛事禁止使用Arc平滑度");
  if (!checks.allowFloatTapHold && hasFloatAffLane(statement)) failures.add("AFF: 当前赛事禁止使用浮点Tap/Hold");
  if (!checks.allowSizeKey && statement.startTime !== null && statement.endTime !== null && Number(statement.startTime) === Number(statement.endTime) && Number(statement.color) === 3) failures.add("AFF: 当前赛事禁止使用大小键");
}

function hasFloatAffLane(statement) {
  if (statement.type === "tap") return isFloatingAffNumber(statement.args?.[1]);
  if (statement.type === "hold") return isFloatingAffNumber(statement.args?.[2]);
  return false;
}

function isFloatingAffNumber(value) {
  const text = clean(value);
  return /^[-+]?(?:\d+\.\d+|\d+\.\d*|\.\d+)$/.test(text);
}

function checkAffSceneControlSyntax(statement, checks, failures) {
  const controlType = clean(statement.controlType).toLowerCase();
  if (!checks.allowTrackHideShow && ["trackhide", "trackshow"].includes(controlType)) failures.add("AFF: 当前赛事禁止使用trackhide/trackshow");
  if (!checks.allowTrackDisplay && controlType === "trackdisplay") failures.add("AFF: 当前赛事禁止使用trackdisplay");
  if (!checks.allowArcahvEffects && ["redline", "arcahvdistort", "arcahvdebris"].includes(controlType)) failures.add("AFF: 当前赛事禁止使用Arcahv相关scenecontrol效果");
  if (!checks.allowHideGroup && controlType === "hidegroup") failures.add("AFF: 当前赛事禁止使用hidegroup");
  if (!checks.allowSixK && ["enwidenlanes", "enwidencamera"].includes(controlType)) failures.add("AFF: 当前赛事禁止使用6k");
}

function checkAffTimingGroupSyntax(statement, checks, failures) {
  const flags = ` ${clean(statement.flags).toLowerCase()} `;
  if (!checks.allowNoInput && /\bnoinput\b/.test(flags)) failures.add("AFF: 当前赛事禁止使用noinput");
  if (!checks.allowAngle && (/\banglex\b/.test(flags) || /\bangley\b/.test(flags))) failures.add("AFF: 当前赛事禁止使用angle");
  if (!checks.allowFadingHolds && /\bfadingholds\b/.test(flags)) failures.add("AFF: 当前赛事禁止使用fadingholds");
}

function parseAffFile(input, options = {}) {
  const text = Buffer.isBuffer(input) ? input.toString("utf8").replace(/^\uFEFF/, "") : String(input || "").replace(/^\uFEFF/, "");
  const headerSplit = splitAffHeader(text);
  const headers = parseAffHeaders(headerSplit.headerText);
  const bodyText = stripAffLineComments(headerSplit.bodyText);
  const errors = [];
  const statements = scanAffStatements(bodyText, errors).map((statement) => parseAffStatement(statement, errors));
  const groups = statements.filter((statement) => statement.type === "timinggroup");
  const flatStatements = flattenAffStatements(statements);
  return {
    ok: !errors.length,
    fileName: options.fileName || "",
    rawText: text,
    hasSeparator: headerSplit.hasSeparator,
    headers,
    audioOffset: numericHeader(headers, "AudioOffset", 0),
    timingPointDensityFactor: numericHeader(headers, "TimingPointDensityFactor", 1),
    statements,
    groups,
    flatStatements,
    stats: affStats(flatStatements),
    errors
  };
}

function splitAffHeader(text) {
  const lines = String(text || "").split(/\r?\n/);
  const separatorIndex = lines.findIndex((line) => line.trim() === "-");
  if (separatorIndex === -1) return { hasSeparator: false, headerText: "", bodyText: text };
  return {
    hasSeparator: true,
    headerText: lines.slice(0, separatorIndex).join("\n"),
    bodyText: lines.slice(separatorIndex + 1).join("\n")
  };
}

function parseAffHeaders(headerText) {
  return String(headerText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const index = line.indexOf(":");
    return index === -1
      ? { key: line, value: "" }
      : { key: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
  });
}

function numericHeader(headers, key, fallback) {
  const item = headers.find((header) => header.key === key);
  if (!item) return fallback;
  const value = Number(item.value);
  return Number.isFinite(value) ? value : fallback;
}

function stripAffLineComments(text) {
  return String(text || "").split(/\r?\n/).map((line) => {
    const index = line.indexOf("//");
    return index === -1 ? line : line.slice(0, index);
  }).join("\n");
}

function scanAffStatements(text, errors = []) {
  const statements = [];
  let start = 0;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") paren += 1;
    else if (char === ")") paren = Math.max(0, paren - 1);
    else if (char === "[") bracket += 1;
    else if (char === "]") bracket = Math.max(0, bracket - 1);
    else if (char === "{") brace += 1;
    else if (char === "}") brace = Math.max(0, brace - 1);
    if (char === ";" && paren === 0 && bracket === 0 && brace === 0) {
      const statement = text.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) {
    errors.push("存在未以分号结束的AFF语句");
    statements.push(tail);
  }
  return statements;
}

function parseAffStatement(statement, errors = [], group = null) {
  const text = String(statement || "").trim();
  const timingGroup = text.match(/^timinggroup\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/);
  if (timingGroup) {
    const innerErrors = [];
    const children = scanAffStatements(timingGroup[2], innerErrors).map((item) => parseAffStatement(item, innerErrors, timingGroup[1].trim()));
    errors.push(...innerErrors.map((error) => `timinggroup: ${error}`));
    return {
      type: "timinggroup",
      raw: text,
      group,
      flags: timingGroup[1].trim(),
      statements: children
    };
  }
  if (/^arc\s*\(/.test(text)) {
    const arc = parseAffArcText(text);
    if (arc) return parseAffArcStatement(text, arc, group);
  }
  const callMatch = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/);
  if (callMatch) return normalizeAffCall(callMatch[1], splitAffArguments(callMatch[2]), text, group);
  const tapMatch = text.match(/^\(([\s\S]*)\)$/);
  if (tapMatch) return normalizeAffCall("tap", splitAffArguments(tapMatch[1]), text, group);
  return { type: "unknown", raw: text, group };
}

function parseAffArcText(text) {
  const open = text.indexOf("(");
  const close = findMatchingBracket(text, open, "(", ")");
  if (open === -1 || close === -1) return null;
  const tail = text.slice(close + 1).trim();
  let arctapText = "";
  if (tail) {
    if (!tail.startsWith("[") || !tail.endsWith("]")) return null;
    const bracketClose = findMatchingBracket(tail, 0, "[", "]");
    if (bracketClose !== tail.length - 1) return null;
    arctapText = tail.slice(1, -1);
  }
  return { argsText: text.slice(open + 1, close), arctapText };
}

function findMatchingBracket(text, openIndex, openChar, closeChar) {
  if (openIndex < 0 || text[openIndex] !== openChar) return -1;
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === openChar) depth += 1;
    else if (text[index] === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parseAffArcStatement(raw, arc, group) {
  const args = splitAffArguments(arc.argsText);
  const arctaps = arc.arctapText ? splitAffArguments(arc.arctapText).map((item) => parseAffStatement(item, [], group)).filter((item) => ["arctap", "at"].includes(item.type)) : [];
  const parsed = normalizeAffCall("arc", args, raw, group);
  parsed.arctaps = arctaps.map((item) => ({ time: item.time, raw: item.raw }));
  parsed.arctapCount = parsed.arctaps.length;
  return parsed;
}

function splitAffArguments(value) {
  const args = [];
  let start = 0;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") paren += 1;
    else if (char === ")") paren = Math.max(0, paren - 1);
    else if (char === "[") bracket += 1;
    else if (char === "]") bracket = Math.max(0, bracket - 1);
    else if (char === "{") brace += 1;
    else if (char === "}") brace = Math.max(0, brace - 1);
    if (char === "," && paren === 0 && bracket === 0 && brace === 0) {
      args.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail || text.endsWith(",")) args.push(tail);
  return args;
}

function normalizeAffCall(name, args, raw, group) {
  const type = name === "at" ? "arctap" : name === "tap" ? "tap" : name.toLowerCase();
  const base = { type, raw, group, args };
  if (type === "timing") return { ...base, time: toAffNumber(args[0]), bpm: toAffNumber(args[1]), beats: toAffNumber(args[2]) };
  if (type === "tap") return { ...base, time: toAffNumber(args[0]), lane: toAffNumber(args[1]) };
  if (type === "hold") return { ...base, startTime: toAffNumber(args[0]), endTime: toAffNumber(args[1]), lane: toAffNumber(args[2]) };
  if (type === "arc") {
    return {
      ...base,
      startTime: toAffNumber(args[0]),
      endTime: toAffNumber(args[1]),
      x1: toAffNumber(args[2]),
      x2: toAffNumber(args[3]),
      easing: args[4] || "",
      y1: toAffNumber(args[5]),
      y2: toAffNumber(args[6]),
      color: toAffNumber(args[7]),
      hitsound: args[8] || "",
      arcType: args[9] || "",
      smoothness: args.length > 10 ? toAffNumber(args[10]) : null
    };
  }
  if (type === "arctap") return { ...base, time: toAffNumber(args[0]) };
  if (type === "camera") {
    return { ...base, time: toAffNumber(args[0]), x: toAffNumber(args[1]), y: toAffNumber(args[2]), z: toAffNumber(args[3]), xozAng: toAffNumber(args[4]), yozAng: toAffNumber(args[5]), xoyAng: toAffNumber(args[6]), ease: args[7] || "", duration: toAffNumber(args[8]) };
  }
  if (type === "scenecontrol") return { ...base, time: toAffNumber(args[0]), controlType: args[1] || "", param1: args.length > 2 ? toAffNumber(args[2]) : null, param2: args.length > 3 ? toAffNumber(args[3]) : null };
  if (type === "flick") return { ...base, time: toAffNumber(args[0]), x: toAffNumber(args[1]), y: toAffNumber(args[2]), vx: toAffNumber(args[3]), vy: toAffNumber(args[4]) };
  return base;
}

function toAffNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function flattenAffStatements(statements) {
  const flattened = [];
  statements.forEach((statement) => {
    if (statement.type === "timinggroup") flattened.push(...flattenAffStatements(statement.statements || []));
    else flattened.push(statement);
  });
  return flattened;
}

function affStats(statements) {
  return statements.reduce((stats, statement) => {
    stats.total += 1;
    stats[statement.type] = (stats[statement.type] || 0) + 1;
    if (statement.type === "arc") stats.arctap = (stats.arctap || 0) + Number(statement.arctapCount || 0);
    return stats;
  }, { total: 0 });
}

function readZipEntries(buffer) {
  const entries = [];
  for (let index = 0; index <= buffer.length - 46; index += 1) {
    if (buffer.readUInt32LE(index) !== 0x02014b50) continue;
    const method = buffer.readUInt16LE(index + 10);
    const compressedSize = buffer.readUInt32LE(index + 20);
    const nameLength = buffer.readUInt16LE(index + 28);
    const extraLength = buffer.readUInt16LE(index + 30);
    const commentLength = buffer.readUInt16LE(index + 32);
    const localHeaderOffset = buffer.readUInt32LE(index + 42);
    const nameStart = index + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;
    const name = buffer.slice(nameStart, nameEnd).toString("utf8");
    const data = readZipEntryData(buffer, localHeaderOffset, method, compressedSize);
    entries.push({ name, data });
    index = nameEnd + extraLength + commentLength - 1;
  }
  return entries;
}

function readZipEntryData(buffer, localHeaderOffset, method, compressedSize) {
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) return Buffer.alloc(0);
  const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
  const compressed = buffer.slice(dataStart, dataStart + compressedSize);
  if (method === 0) return compressed;
  if (method === 8) return zlib.inflateRawSync(compressed);
  return Buffer.alloc(0);
}

function findZipEntryByBaseName(entries, fileName) {
  return entries.find((entry) => zipBaseName(entry.name) === fileName);
}

function zipBaseName(name) {
  return String(name || "").replace(/\\/g, "/").split("/").pop();
}

function isJpeg(buffer) {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function hasJpegSize(buffer, width, height) {
  const size = getJpegSize(buffer);
  return Boolean(size && size.width === width && size.height === height);
}

function getJpegSize(buffer) {
  if (!isJpeg(buffer)) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }
  return null;
}

function isOgg(buffer) {
  return buffer.length >= 4 && buffer.slice(0, 4).toString("ascii") === "OggS";
}

function isWav(buffer) {
  return buffer.length >= 12 &&
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WAVE";
}

function getOggDurationSeconds(buffer) {
  if (!isOgg(buffer)) return null;
  const sampleRate = getVorbisSampleRate(buffer);
  if (!sampleRate) return null;
  let offset = 0;
  let maxGranule = 0;
  while (offset + 27 <= buffer.length) {
    if (buffer.slice(offset, offset + 4).toString("ascii") !== "OggS") {
      offset += 1;
      continue;
    }
    const granule = Number(buffer.readBigUInt64LE(offset + 6));
    if (granule > maxGranule) maxGranule = granule;
    const segments = buffer[offset + 26];
    const segmentTableEnd = offset + 27 + segments;
    if (segmentTableEnd > buffer.length) break;
    let bodyLength = 0;
    for (let index = offset + 27; index < segmentTableEnd; index += 1) bodyLength += buffer[index];
    offset = segmentTableEnd + bodyLength;
  }
  return maxGranule > 0 ? maxGranule / sampleRate : null;
}

function getVorbisSampleRate(buffer) {
  const marker = Buffer.from([1, 118, 111, 114, 98, 105, 115]);
  const offset = buffer.indexOf(marker);
  if (offset === -1 || offset + 16 > buffer.length) return null;
  const sampleRate = buffer.readUInt32LE(offset + 12);
  return sampleRate > 0 ? sampleRate : null;
}

function createZipArchive(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach((file) => {
    const nameBuffer = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, file.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + file.data.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function findSubmittableBattle(id) {
  return readJsonFile(BATTLES_FILE).find((battle) => battle.id === id && battlePhase(battle).kind === "writing");
}

function findBattleAcceptingModification(id, submission) {
  const battle = readJsonFile(BATTLES_FILE).find((item) => item.id === id);
  if (!battle) return null;
  const phase = battlePhase(battle).kind;
  if (phase === "writing") return battle;
  if (submission?.status === "approved" && Date.now() <= approvedModificationDeadline(battle)) return battle;
  return null;
}

function canModifySubmissionNow(submission) {
  if (!submission) return false;
  return Boolean(findBattleAcceptingModification(submission.battleId, submission));
}

function approvedModificationDeadline(battle) {
  return new Date(getBattleTimes(battle).packingEndTime).getTime() - 2 * 24 * 60 * 60 * 1000;
}

function getBattleTimes(battle) {
  const writingStartTime = battle.writingStartTime || battle.startTime;
  const writingEndTime = battle.writingEndTime || battle.endTime;
  const packingStartTime = battle.packingStartTime || writingEndTime;
  const packingEndTime = battle.packingEndTime || addDaysIso(packingStartTime, 1);
  const snipingStartTime = battle.snipingStartTime || packingEndTime;
  const snipingEndTime = battle.snipingEndTime || addDaysIso(snipingStartTime, 1);
  return { writingStartTime, writingEndTime, packingStartTime, packingEndTime, snipingStartTime, snipingEndTime };
}

function battlePhase(battle) {
  const now = Date.now();
  const times = getBattleTimes(battle);
  const writingStart = new Date(times.writingStartTime).getTime();
  const writingEnd = new Date(times.writingEndTime).getTime();
  const packingEnd = new Date(times.packingEndTime).getTime();
  const snipingEnd = new Date(times.snipingEndTime).getTime();
  if (now < writingStart) return { kind: "upcoming", label: "尚未到来", endsAt: times.writingStartTime };
  if (now <= writingEnd) return { kind: "writing", label: "写谱阶段", endsAt: times.writingEndTime };
  if (now <= packingEnd) return { kind: "packing", label: "整理阶段", endsAt: times.packingEndTime };
  if (now <= snipingEnd) return { kind: "sniping", label: "狙击阶段", endsAt: times.snipingEndTime };
  return { kind: "ended", label: "已结束", endsAt: "" };
}

function validDateValue(value) {
  return value && new Date(value).toString() !== "Invalid Date" ? value : "";
}

function addDaysIso(value, days) {
  const date = new Date(new Date(value).getTime() + days * 24 * 60 * 60 * 1000);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function optionalUser(req) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const session = token && sessions.get(token);
  if (!session) return null;
  return readJsonFile(USERS_FILE).find((item) => item.id === session.userId) || null;
}

function canDownloadBattleCharts(user, battleId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const battle = readJsonFile(BATTLES_FILE).find((item) => item.id === battleId);
  if (battle && canHostBattle(user, battle)) return true;
  return Boolean(battle && canUserAccessBattle(user, battle));
}

function canDownloadBattleRules(user, battle) {
  if (!user || !battle) return false;
  if (user.role === "admin") return true;
  if (canHostBattle(user, battle)) return true;
  return canUserAccessBattle(user, battle);
}

function canHostBattle(user, battle) {
  if (!user || !battle) return false;
  if (user.role === "admin") return true;
  return (battle.hostUserIds || []).includes(user.id);
}

function canUserAccessBattle(user, battle) {
  const groupIds = battle.allowedGroupIds || (battle.allowedGroupId ? [battle.allowedGroupId] : []);
  if (!groupIds.length) return true;
  if (!user || user.role !== "user") return false;
  return groupIds.some((id) => (user.groupIds || []).includes(id));
}

function hasSubmissionSlot(userId, battleOrId, division, excludeSubmissionId = "") {
  const battle = typeof battleOrId === "string"
    ? readJsonFile(BATTLES_FILE).find((item) => item.id === battleOrId)
    : battleOrId;
  if (!battle) return false;
  const config = divisionConfigForBattle(battle, division);
  const limit = config ? config.limit : battle.submissionLimits?.[division];
  if (limit === "" || limit === undefined || limit === null) return true;
  return countUserDivisionSlots(userId, battle.id, division, excludeSubmissionId) < Number(limit);
}

function hasDuplicateSongId(userId, battleId, songId, excludeSubmissionId = "") {
  const activeStatuses = new Set(["pending", "waiting_collaboration", "approved"]);
  return readJsonFile(SUBMISSIONS_FILE).some((submission) => (
    submission.id !== excludeSubmissionId &&
    submission.battleId === battleId &&
    submission.songId === songId &&
    activeStatuses.has(submission.status) &&
    (submission.userId === userId || (submission.collaborators || []).some((collaborator) => collaborator.userId === userId && collaborator.status === "accepted"))
  ));
}

function canWithdrawSubmissionNow(submission) {
  const battle = readJsonFile(BATTLES_FILE).find((item) => item.id === submission.battleId);
  return Boolean(battle && battlePhase(battle).kind === "writing");
}

function canWithdrawSubmission(submission) {
  return ["pending", "approved"].includes(submission.status) && canWithdrawSubmissionNow(submission);
}

function countUserDivisionSlots(userId, battleId, division, excludeSubmissionId = "") {
  const activeStatuses = new Set(["pending", "waiting_collaboration", "approved"]);
  return readJsonFile(SUBMISSIONS_FILE).filter((submission) => {
    if (submission.id === excludeSubmissionId) return false;
    if (submission.battleId !== battleId || submission.division !== division || !activeStatuses.has(submission.status)) return false;
    if (submission.userId === userId) return true;
    return (submission.collaborators || []).some((collaborator) => collaborator.userId === userId && collaborator.status === "accepted");
  }).length;
}

function dailyChartSubmissionCount(userId) {
  const today = dayKeyUtc8(new Date());
  return readJsonFile(SUBMISSIONS_FILE).filter((submission) => (
    submission.userId === userId &&
    submission.type === "chart" &&
    dayKeyUtc8(new Date(submission.createdAt)) === today
  )).length;
}

function dayKeyUtc8(date) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function publicUserSubmissions(userId) {
  const battles = readJsonFile(BATTLES_FILE);
  const endedBattleIds = new Set(battles.filter((battle) => battlePhase(battle).kind === "ended").map((battle) => battle.id));
  return readJsonFile(SUBMISSIONS_FILE)
    .filter((submission) => (
      submission.status === "approved" &&
      endedBattleIds.has(submission.battleId) &&
      (submission.userId === userId || (submission.collaborators || []).some((collaborator) => collaborator.userId === userId && collaborator.status === "accepted"))
    ))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((submission) => ({
      id: submission.id,
      battleTitle: submission.battleTitle,
      songId: submission.songId,
      songTitle: submission.songTitle || "",
      songArtist: submission.songArtist || "",
      thumbnailUrl: submission.thumbnailFileName ? uploadUrl(submission.thumbnailFileName) : "/assets/collection-placeholder.svg",
      division: submission.division,
      divisionName: submission.divisionName || "",
      createdAt: submission.createdAt
    }));
}

function publicUserHostedBattles(userId) {
  return readJsonFile(BATTLES_FILE)
    .filter((battle) => (battle.hostUserIds || []).includes(userId))
    .sort(sortTimelineItems)
    .map((battle) => {
      const phase = battlePhase(battle);
      return {
        id: battle.id,
        title: battle.title,
        description: battle.description || battle.note || "",
        bannerUrl: battle.bannerFileName ? uploadUrl(battle.bannerFileName) : "/assets/battle-banner-placeholder.svg",
        phase: phase.kind,
        phaseLabel: phase.label,
        writingStartTime: battle.writingStartTime || battle.startTime || "",
        snipingEndTime: battle.snipingEndTime || battle.endTime || "",
        startTime: battle.writingStartTime || battle.startTime || "",
        endTime: battle.snipingEndTime || battle.endTime || ""
      };
    });
}

function countBattleSubmissions(battleId, phase = "") {
  const statuses = phase === "writing" ? new Set(["pending", "waiting_collaboration", "approved"]) : new Set(["approved"]);
  return readJsonFile(SUBMISSIONS_FILE).filter((submission) => (
    submission.battleId === battleId &&
    statuses.has(submission.status) &&
    submission.savedFileName
  )).length;
}

function sendBattleArchive(res, battle, options = {}) {
  const normalizedChecks = normalizeOptionalChecks(battle.optionalChecks);
  const useExpandedArchive = Boolean(normalizedChecks.aafAccNormalize);
  const files = useExpandedArchive
    ? buildExpandedBattleArchiveFiles(battle, options)
    : buildPackedBattleArchiveFiles(battle, options);
  const archive = createZipArchive(files);
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(`${battle.title}-charts.zip`)}"`
  });
  res.end(archive);
}

function buildPackedBattleArchiveFiles(battle, options = {}) {
  return readJsonFile(SUBMISSIONS_FILE)
    .filter((submission) => (
      submission.battleId === battle.id &&
      submission.savedFileName &&
      (options.includeAll ? submission.status !== "withdrawn" : submission.status === "approved")
    ))
    .map((submission) => ({
      name: `${submission.songId}-${submission.chartName || submission.username}.zip`.replace(/[\\/:*?"<>|]/g, "_"),
      filePath: uploadPath(submission.savedFileName)
    }))
    .filter((file) => fs.existsSync(file.filePath))
    .map((file) => ({ name: file.name, data: fs.readFileSync(file.filePath) }));
}

function buildExpandedBattleArchiveFiles(battle, options = {}) {
  const submissions = readJsonFile(SUBMISSIONS_FILE)
    .filter((submission) => (
      submission.battleId === battle.id &&
      submission.savedFileName &&
      (options.includeAll ? submission.status !== "withdrawn" : submission.status === "approved")
    ))
    .filter((submission) => fs.existsSync(uploadPath(submission.savedFileName)));
  const usedFolderNames = new Set();
  const files = [];
  submissions.forEach((submission) => {
    const zipBuffer = fs.readFileSync(uploadPath(submission.savedFileName));
    const zipEntries = readZipEntries(zipBuffer);
    const songlistEntry = findSonglistEntry(zipEntries);
    const folderName = allocateArchiveFolderName(submission.songId, usedFolderNames, submission);
    zipEntries.forEach((entry) => {
      const entryPath = normalizeArchiveEntryName(entry.name);
      if (!entryPath) return;
      const outputName = `${folderName}/${entryPath}`;
      if (isSonglistArchiveEntry(entry)) {
        files.push({ name: outputName, data: rebuildSonglistArchiveEntry(entry, folderName, songlistEntry) });
        return;
      }
      files.push({ name: outputName, data: entry.data });
    });
  });
  return files;
}

function allocateArchiveFolderName(baseName, usedFolderNames, submission) {
  const cleanBase = sanitizeArchiveSegment(baseName || submission.songId || "chart");
  if (!usedFolderNames.has(cleanBase)) {
    usedFolderNames.add(cleanBase);
    return cleanBase;
  }
  const seed = `${submission.id || ""}:${submission.songId || ""}:${submission.userId || ""}`;
  const hash = crypto.createHash("sha1").update(seed).digest("hex");
  for (let length = 4; length <= 10; length += 2) {
    const candidate = `${cleanBase}_${hash.slice(0, length)}`;
    if (!usedFolderNames.has(candidate)) {
      usedFolderNames.add(candidate);
      return candidate;
    }
  }
  let index = 1;
  let candidate = `${cleanBase}_${index}`;
  while (usedFolderNames.has(candidate)) {
    index += 1;
    candidate = `${cleanBase}_${index}`;
  }
  usedFolderNames.add(candidate);
  return candidate;
}

function sanitizeArchiveSegment(value) {
  return sanitizeFileName(String(value || "chart").replace(/[\\/]/g, "_")).replace(/\s+/g, "_") || "chart";
}

function normalizeArchiveEntryName(name) {
  return String(name || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^\.\//, "");
}

function isSonglistArchiveEntry(entry) {
  const base = zipBaseName(entry.name).toLowerCase();
  return base === "songlist.json" || base === "songlist";
}

function rebuildSonglistArchiveEntry(entry, folderName, songlistEntry) {
  if (!songlistEntry) return entry.data;
  try {
    const json = JSON.parse(songlistEntry.data.toString("utf8").replace(/^\uFEFF/, ""));
    json.id = folderName;
    return Buffer.from(JSON.stringify(json, null, 2), "utf8");
  } catch {
    return entry.data;
  }
}

function chinaDayKey(date = new Date()) {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return chinaTime.toISOString().slice(0, 10);
}

function pickWeightedDrop(drops) {
  const total = drops.reduce((sum, drop) => sum + Number(drop.probability || 0), 0);
  let roll = Math.random() * total;
  for (const drop of drops) {
    roll -= Number(drop.probability || 0);
    if (roll <= 0) return drop;
  }
  return drops[drops.length - 1];
}

function sortTimelineItems(a, b) {
  const rankDiff = timelineRank(a) - timelineRank(b);
  if (rankDiff !== 0) return rankDiff;
  return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
}

function timelineRank(item) {
  const now = Date.now();
  const start = new Date(item.startTime).getTime();
  const end = new Date(item.endTime).getTime();
  if (now > end) return 0;
  if (now >= start && now <= end) return 1;
  return 2;
}

function canViewSubmission(user, submission) {
  if (user.role === "admin") return true;
  if (submission.userId === user.id) return true;
  return (submission.collaborators || []).some((collaborator) => collaborator.userId === user.id && collaborator.status === "accepted");
}

function sanitizeFileName(fileName) {
  return path.basename(fileName).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".json": "application/json; charset=utf-8",
    ".zip": "application/zip"
  };
  return types[ext] || "application/octet-stream";
}
