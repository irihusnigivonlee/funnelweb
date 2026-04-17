const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");

const app = express();

app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));


// ==========================
/* =========================
ADMIN LOGIN
========================= */

const ADMIN_PASSWORD = "admin123";

app.post("/admin-login", (req, res) => {

  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {

    res.json({
      success: true,
      token: "admin_logged"
    });

  } else {

    res.json({
      success: false
    });

  }

});
/* =========================
AUTO CREATE FOLDER
========================= */

const folders = [
  "uploads",
  "uploads/video",
  "uploads/thumb",
  "uploads/ebook",
  "uploads/cover",
];

folders.forEach((folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

/* =========================
UTILS
========================= */

function fixUrl(url) {
  if (!url) return "";
  if (!url.startsWith("http")) return "https://" + url;
  return url;
}

function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* =========================
VIDEO STORAGE
========================= */

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/video");
  },

  filename: (req, file, cb) => {
    const clean = file.originalname.replace(/\s+/g, "_");
    cb(null, Date.now() + "-" + clean);
  },
});

const videoUpload = multer({
  storage: videoStorage,

  limits: {
    fileSize: 1000 * 1024 * 1024,
  },
});

/* =========================
EBOOK STORAGE
========================= */

const ebookStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "file") cb(null, "uploads/ebook");
    else cb(null, "uploads/cover");
  },

  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const ebookUpload = multer({
  storage: ebookStorage,

  limits: {
    fileSize: 500 * 1024 * 1024,
  },
});

/* =========================
GET VIDEOS
========================= */

app.get("/videos", (req, res) => {
  const videos = readJSON("videos.json");

  res.json(videos.filter((v) => v.status === "active"));
});

/* =========================
GET EBOOKS
========================= */

app.get("/ebooks", (req, res) => {
  const ebooks = readJSON("ebooks.json");

  res.json(ebooks);
});

/* =========================
UPLOAD VIDEO
========================= */

app.post("/upload-video", videoUpload.single("video"), async (req, res) => {
  try {
    const { title, category, creator } = req.body;
    if (!creator) {
      return res.json({
        message: "Nama creator wajib diisi",
      });
    }
    if (!title) {
      return res.json({
        message: "Judul video wajib diisi",
      });
    }
    // ===========================
    const website = fixUrl(req.body.website);
    const tutorial = fixUrl(req.body.tutorial);
    const linkvertise = req.body.linkvertise?.trim();

    if (!linkvertise) {
      return res.json({
        message: "Link Linkvertise wajib diisi",
      });
    }

    if (
      !linkvertise.includes("direct-link.net/1314520") &&
      !linkvertise.includes(
        "linkvertise.com/?publisherClosed=true&affiliate_id=1314520",
      )
    ) {
      return res.json({
        message: "Gunakan link affiliate Linkvertise yang benar",
      });
    }
    // ============================

    if (!req.file) {
      return res.json({
        message: "Video wajib diupload",
      });
    }
    const videoFile = req.file.filename;

    const videoPath = path.join(__dirname, "uploads/video", videoFile);

    const thumbFile = Date.now() + ".jpg";

    const thumbPath = path.join(__dirname, "uploads/thumb", thumbFile);

    /* CREATE THUMBNAIL */

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .on("end", resolve)

        .on("error", reject)

        .screenshots({
          count: 1,

          filename: thumbFile,

          folder: path.join(__dirname, "uploads/thumb"),

          size: "640x?",
        });
    });

    let videos = readJSON("videos.json");

    /* BACKUP */

    writeJSON("videos-backup.json", videos);

    const newVideo = {
      id: Date.now(),

      title,
      creator,
      category,

      website,
      tutorial,
      linkvertise,

      video: "/uploads/video/" + videoFile,

      thumb: "/uploads/thumb/" + thumbFile,

      downloads: 0,

      status: "active",
    };

    /* VIDEO TERBARU DI ATAS */

    videos.unshift(newVideo);

    writeJSON("videos.json", videos);

    res.json({ message: "Upload berhasil" });
  } catch (err) {
    console.log("UPLOAD VIDEO ERROR:", err);

    res.json({ message: "Upload gagal" });
  }
});

/* =========================
UPLOAD EBOOK
========================= */

app.post(
  "/upload-ebook",

  ebookUpload.fields([
    { name: "file", maxCount: 1 },

    { name: "cover", maxCount: 1 },
  ]),

  (req, res) => {
    try {
      let ebooks = readJSON("ebooks.json");

      writeJSON("ebooks-backup.json", ebooks);

      const newEbook = {
        id: Date.now(),

        title: req.body.title,

        creator: req.body.creator,

        desc: req.body.desc,

        category: req.body.category,

        website: fixUrl(req.body.website),

        linkvertise: req.body.linkvertise,

        downloads: 0,

        file: req.files["file"][0].filename,

        cover: req.files["cover"][0].filename,
      };

      ebooks.unshift(newEbook);

      writeJSON("ebooks.json", ebooks);

      res.json({ message: "Upload berhasil" });
    } catch (err) {
      console.log("UPLOAD EBOOK ERROR:", err);

      res.json({ message: "Upload gagal" });
    }
  },
);

/* =========================
VIDEO DOWNLOAD
========================= */

app.get("/video-download/:id", (req, res) => {
  let videos = readJSON("videos.json");

  const id = Number(req.params.id);

  const video = videos.find((v) => v.id === id);

  if (!video) {
    return res.send("Video tidak ditemukan");
  }

  video.downloads++;

  writeJSON("videos.json", videos);

  res.redirect(video.linkvertise);
});

/* =========================
EBOOK DOWNLOAD
========================= */

app.get("/ebook-download/:id", (req, res) => {
  let ebooks = readJSON("ebooks.json");

  const id = Number(req.params.id);

  const ebook = ebooks.find((e) => e.id === id);

  if (!ebook) {
    return res.send("Ebook tidak ditemukan");
  }

  ebook.downloads++;

  writeJSON("ebooks.json", ebooks);

  res.redirect(ebook.linkvertise);
});

/* =========================
CONFIG
========================= */

const CONFIG_FILE = "config.json";

app.get("/config", (req, res) => {
  if (!fs.existsSync(CONFIG_FILE)) {
    return res.json({});
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_FILE));

  res.json(config);
});

app.post("/save-config", (req, res) => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(req.body, null, 2));

    res.json({ success: true });
  } catch (err) {
    console.log("CONFIG ERROR:", err);

    res.status(500).json({ success: false });
  }
});

/* =========================
START SERVER
========================= */

const PORT = 5000;

app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
