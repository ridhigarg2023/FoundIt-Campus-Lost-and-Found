require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors");
const pool = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const FRONTEND = path.join(__dirname, "..", "frontend");
const UPLOADS = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, {recursive:true});

app.use(cors());
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true}));
app.use("/uploads", express.static(UPLOADS));
app.use(express.static(FRONTEND));

const storage = multer.diskStorage({
  destination: (_req,_file,cb)=>cb(null,UPLOADS),
  filename: (_req,file,cb)=>cb(null,Date.now()+"-"+Math.round(Math.random()*1e9)+path.extname(file.originalname).toLowerCase())
});
const upload = multer({
  storage,
  limits:{fileSize:5*1024*1024},
  fileFilter:(_req,file,cb)=>{
    const allowed=["image/jpeg","image/png","image/webp"];
    cb(allowed.includes(file.mimetype)?null:new Error("Only JPG, PNG or WEBP images are allowed."),allowed.includes(file.mimetype));
  }
});

function auth(req,res,next) {
  const header=req.headers.authorization||"";
  const token=header.startsWith("Bearer ")?header.slice(7):null;
  if(!token)return res.status(401).json({message:"Please login to continue."});
  try {req.user=jwt.verify(token,process.env.JWT_SECRET||"change-this-secret-before-deployment");next();}
  catch {return res.status(401).json({message:"Session expired. Please login again."});}
}
function adminOnly(req,res,next) {
  if(req.user.role!=="admin")return res.status(403).json({message:"Admin access required."});
  next();
}
const cleanItem = row => ({...row, image_url:row.image_path?"/uploads/"+row.image_path:null});

app.get("/api/health",(_req,res)=>res.json({status:"ok"}));

app.post("/api/auth/register",async(req,res)=>{
  try {
    const {name,email,password,phone=""}=req.body;
    if(!name||!email||!password||password.length<8)return res.status(400).json({message:"Enter name, valid email and a password of at least 8 characters."});
    const [exists]=await pool.query("SELECT id FROM users WHERE email=?",[email.toLowerCase().trim()]);
    if(exists.length)return res.status(409).json({message:"An account with this email already exists."});
    const hash=await bcrypt.hash(password,12);
    const [result]=await pool.query("INSERT INTO users(name,email,password_hash,phone) VALUES(?,?,?,?)",[name.trim(),email.toLowerCase().trim(),hash,phone.trim()]);
    const user={id:result.insertId,name:name.trim(),email:email.toLowerCase().trim(),role:"student"};
    const token=jwt.sign(user,process.env.JWT_SECRET||"change-this-secret-before-deployment",{expiresIn:"2d"});
    res.status(201).json({message:"Account created.",user,token});
  } catch(err){console.error(err);res.status(500).json({message:"Could not create account."});}
});

app.post("/api/auth/login",async(req,res)=>{
  try {
    const {email,password}=req.body;
    const [rows]=await pool.query("SELECT id,name,email,password_hash,role FROM users WHERE email=?",[String(email||"").toLowerCase().trim()]);
    if(!rows.length||!(await bcrypt.compare(password||"",rows[0].password_hash)))return res.status(401).json({message:"Incorrect email or password."});
    const row=rows[0],user={id:row.id,name:row.name,email:row.email,role:row.role};
    const token=jwt.sign(user,process.env.JWT_SECRET||"change-this-secret-before-deployment",{expiresIn:"2d"});
    res.json({message:"Login successful.",user,token});
  } catch(err){console.error(err);res.status(500).json({message:"Could not login."});}
});

app.get("/api/stats",async(_req,res)=>{
  try {
    const [[r]]=await pool.query("SELECT COUNT(*) total, SUM(status='lost') lost_count, SUM(status='found') found_count, SUM(status='returned') returned_count FROM items");
    res.json({active:Number(r.total||0),lost:Number(r.lost_count||0),found:Number(r.found_count||0),returned:Number(r.returned_count||0)});
  } catch(err){console.error(err);res.status(500).json({message:"Could not load statistics."});}
});

app.get("/api/items",async(req,res)=>{
  try {
    const {status,category,q}=req.query;
    let sql="SELECT i.id,i.user_id,i.title,i.description,i.category,i.location,i.item_date,i.status,i.image_path,i.created_at,u.name AS reporter_name FROM items i JOIN users u ON i.user_id=u.id WHERE 1=1";
    const args=[];
    if(["lost","found","returned"].includes(status)){sql+=" AND i.status=?";args.push(status);}
    if(category){sql+=" AND LOWER(i.category)=LOWER(?)";args.push(category);}
    if(q){sql+=" AND (i.title LIKE ? OR i.description LIKE ? OR i.location LIKE ?)";args.push(`%${q}%`,`%${q}%`,`%${q}%`);}
    sql+=" ORDER BY i.created_at DESC LIMIT 100";
    const [rows]=await pool.query(sql,args);
    res.json(rows.map(cleanItem));
  } catch(err){console.error(err);res.status(500).json({message:"Could not load items."});}
});

app.get("/api/items/:id",async(req,res)=>{
  try {
    const [rows]=await pool.query("SELECT id,user_id,title,description,category,location,item_date,status,image_path,created_at FROM items WHERE id=?",[req.params.id]);
    if(!rows.length)return res.status(404).json({message:"Item not found."});
    res.json(cleanItem(rows[0]));
  } catch(err){res.status(500).json({message:"Could not load item."});}
});

app.post("/api/items",auth,upload.single("image"),async(req,res)=>{
  try {
    const {status,title,description,category,location,item_date,contact_phone=""}=req.body;
    if(!["lost","found"].includes(status)||!title||!description||!category||!location||!item_date)return res.status(400).json({message:"Please complete all required fields."});
    const imagePath=req.file?req.file.filename:null;
    const [result]=await pool.query(
      "INSERT INTO items(user_id,title,description,category,location,item_date,status,image_path,contact_phone) VALUES(?,?,?,?,?,?,?,?,?)",
      [req.user.id,title.trim(),description.trim(),category,location.trim(),item_date,status,imagePath,contact_phone.trim()]
    );
    res.status(201).json({message:"Your report has been submitted.",id:result.insertId});
  } catch(err){console.error(err);res.status(500).json({message:err.message||"Could not submit report."});}
});

app.post("/api/claims",auth,async(req,res)=>{
  try {
    const {item_id,proof}=req.body;
    if(!item_id||!proof||proof.trim().length<5)return res.status(400).json({message:"Please provide ownership details (at least 5 characters)."});
    const [items]=await pool.query("SELECT id,user_id,status FROM items WHERE id=?",[item_id]);
    if(!items.length||items[0].status!=="found")return res.status(404).json({message:"This found item is no longer available for claims."});
    if(items[0].user_id===req.user.id)return res.status(400).json({message:"You cannot claim an item you reported."});
    const [existing]=await pool.query("SELECT id FROM claims WHERE item_id=? AND claimant_id=? AND status='pending'",[item_id,req.user.id]);
    if(existing.length)return res.status(409).json({message:"You already have a pending claim for this item."});
    await pool.query("INSERT INTO claims(item_id,claimant_id,proof) VALUES(?,?,?)",[item_id,req.user.id,proof.trim()]);
    res.status(201).json({message:"Claim submitted for admin review."});
  } catch(err){console.error(err);res.status(500).json({message:"Could not submit claim."});}
});

app.get("/api/my/dashboard",auth,async(req,res)=>{
  try {
    const [items]=await pool.query("SELECT id,user_id,title,description,category,location,item_date,status,image_path,created_at FROM items WHERE user_id=? ORDER BY created_at DESC",[req.user.id]);
    const [claims]=await pool.query("SELECT c.id,c.status,c.created_at,i.title AS item_title FROM claims c JOIN items i ON c.item_id=i.id WHERE c.claimant_id=? ORDER BY c.created_at DESC",[req.user.id]);
    res.json({items:items.map(cleanItem),claims});
  } catch(err){res.status(500).json({message:"Could not load dashboard."});}
});

app.get("/api/admin/dashboard",auth,adminOnly,async(_req,res)=>{
  try {
    const [[stats]]=await pool.query("SELECT COUNT(*) total,SUM(status='returned') returned FROM items");
    const [[pending]]=await pool.query("SELECT COUNT(*) pending FROM claims WHERE status='pending'");
    const [claims]=await pool.query("SELECT c.id,c.proof,c.status,c.created_at,i.title AS item_title,u.name AS claimant_name,u.email AS claimant_email FROM claims c JOIN items i ON c.item_id=i.id JOIN users u ON c.claimant_id=u.id WHERE c.status='pending' ORDER BY c.created_at");
    const [items]=await pool.query("SELECT id,user_id,title,description,category,location,item_date,status,image_path,created_at FROM items ORDER BY created_at DESC LIMIT 100");
    res.json({stats:{total:Number(stats.total||0),returned:Number(stats.returned||0),pending:Number(pending.pending||0)},claims,items:items.map(cleanItem)});
  } catch(err){console.error(err);res.status(500).json({message:"Could not load admin dashboard."});}
});

app.patch("/api/admin/claims/:id",auth,adminOnly,async(req,res)=>{
  const {status}=req.body;
  if(!["approved","rejected"].includes(status))return res.status(400).json({message:"Invalid claim status."});
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [claims]=await conn.query("SELECT id,item_id FROM claims WHERE id=? AND status='pending' FOR UPDATE",[req.params.id]);
    if(!claims.length){await conn.rollback();return res.status(404).json({message:"Pending claim not found."});}
    await conn.query("UPDATE claims SET status=? WHERE id=?",[status,req.params.id]);
    if(status==="approved") {
      await conn.query("UPDATE items SET status='returned' WHERE id=?",[claims[0].item_id]);
      await conn.query("UPDATE claims SET status='rejected' WHERE item_id=? AND id<>? AND status='pending'",[claims[0].item_id,req.params.id]);
    }
    await conn.commit();res.json({message:`Claim ${status}.`});
  } catch(err){await conn.rollback();console.error(err);res.status(500).json({message:"Could not update claim."});}
  finally{conn.release();}
});

app.use((err,_req,res,_next)=>{
  console.error(err);
  if(err instanceof multer.MulterError)return res.status(400).json({message:err.message});
  res.status(400).json({message:err.message||"Request error."});
});

app.get("*",(req,res)=>{
  if(req.path.startsWith("/api/"))return res.status(404).json({message:"API route not found."});
  res.sendFile(path.join(FRONTEND,"index.html"));
});

app.listen(PORT,()=>console.log(`FoundIt running at http://localhost:${PORT}`));
