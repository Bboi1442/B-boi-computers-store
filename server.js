const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const PRODUCTS = path.join(DATA, "products.json");
const ORDERS = path.join(DATA, "orders.json");
const SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const WA = process.env.WHATSAPP_NUMBER || "2348022090070";

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(DATA, {recursive:true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
function products() { return readJson(PRODUCTS, []); }
function orders() { return readJson(ORDERS, []); }
function admin(req,res,next) {
  if (!ADMIN_PASSWORD || req.get("x-admin-password") !== ADMIN_PASSWORD) {
    return res.status(401).json({error:"Admin authentication failed."});
  }
  next();
}
app.use(express.json({limit:"100kb", verify:(req,res,buf)=>{req.rawBody=Buffer.from(buf);}}));
app.use(express.static(path.join(ROOT, "public")));

app.get("/api/config", (req,res) => res.json({currency:"NGN", whatsapp:WA}));
app.get("/api/products", (req,res) => res.json(products().filter(p=>p.active)));

app.post("/api/paystack/initialize", async (req,res) => {
  try {
    if (!SECRET || SECRET.includes("replace_with")) return res.status(503).json({error:"Store payments are not configured yet. Add your Paystack secret key on the hosting server."});
    const {email, name, phone, items} = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Enter a valid email address."});
    if (!Array.isArray(items) || !items.length) return res.status(400).json({error:"Your cart is empty."});
    const catalogue = products();
    const lines = [];
    let amount = 0;
    for (const item of items) {
      const p = catalogue.find(x=>x.id===item.id && x.active);
      const qty = Math.max(1, Math.min(20, Number.parseInt(item.quantity,10)||1));
      if (!p || !Number.isSafeInteger(p.priceKobo) || p.priceKobo < 100) {
        return res.status(400).json({error:`${p ? p.name : "A selected item"} is not priced yet. Please contact us or check back later.`});
      }
      amount += p.priceKobo * qty;
      lines.push({id:p.id,name:p.name,quantity:qty,unitPriceKobo:p.priceKobo});
    }
    if (!Number.isSafeInteger(amount) || amount < 100) return res.status(400).json({error:"Invalid order total."});
    const reference = "BB" + Date.now() + crypto.randomBytes(5).toString("hex");
    const order = {reference,email,name:name||"",phone:phone||"",items:lines,amountKobo:amount,currency:"NGN",status:"pending",createdAt:new Date().toISOString()};
    const all = orders(); all.push(order); writeJson(ORDERS,all);

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method:"POST",
      headers:{"Authorization":`Bearer ${SECRET}`,"Content-Type":"application/json"},
      body:JSON.stringify({email,amount,currency:"NGN",reference,callback_url:`${BASE_URL}/?payment=return`,metadata:{order_reference:reference,customer_name:name||"",customer_phone:phone||"",custom_fields:[{display_name:"Order reference",variable_name:"order_reference",value:reference}]}})
    });
    const data = await response.json();
    if (!response.ok || !data.status) {
      const all2=orders(); const o=all2.find(x=>x.reference===reference); if(o)o.status="initialization_failed"; writeJson(ORDERS,all2);
      return res.status(502).json({error:data.message||"Could not start Paystack checkout."});
    }
    res.json({authorization_url:data.data.authorization_url,reference});
  } catch (e) { console.error(e); res.status(500).json({error:"Unable to start checkout right now."}); }
});

app.get("/api/paystack/verify/:reference", async (req,res) => {
  try {
    if (!SECRET || SECRET.includes("replace_with")) return res.status(503).json({error:"Payments are not configured."});
    const reference = req.params.reference;
    const all=orders(); const order=all.find(o=>o.reference===reference);
    if(!order) return res.status(404).json({error:"Order not found."});
    const response=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{"Authorization":`Bearer ${SECRET}`}});
    const result=await response.json();
    if(!response.ok || !result.status) return res.status(502).json({error:"Could not verify payment yet."});
    const d=result.data;
    const valid=d.status==="success" && d.currency==="NGN" && d.amount===order.amountKobo && d.reference===order.reference;
    if(valid && order.status!=="paid"){order.status="paid";order.paidAt=new Date().toISOString();order.paystackTransactionId=d.id;writeJson(ORDERS,all);}
    res.json({paid:valid,status:valid?"paid":d.status,reference:order.reference});
  } catch(e){console.error(e);res.status(500).json({error:"Payment verification failed."});}
});

app.post("/api/paystack/webhook", express.raw({type:"application/json"}), (req,res) => {
  if(!SECRET) return res.sendStatus(503);
  const signature=req.get("x-paystack-signature")||"";
  const raw=req.rawBody || req.body;\n  const hash=crypto.createHmac("sha512",SECRET).update(raw).digest("hex");
  const a=Buffer.from(signature), b=Buffer.from(hash);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.sendStatus(401);
  let event; try{event=JSON.parse(raw.toString("utf8"));}catch{return res.sendStatus(400);}
  if(event.event==="charge.success"){
    const d=event.data; const all=orders(); const order=all.find(o=>o.reference===d.reference);
    if(order && d.status==="success" && d.currency==="NGN" && d.amount===order.amountKobo && order.status!=="paid"){
      order.status="paid";order.paidAt=new Date().toISOString();order.paystackTransactionId=d.id;writeJson(ORDERS,all);
    }
  }
  res.sendStatus(200);
});

app.get("/api/admin/orders",admin,(req,res)=>res.json(orders().slice().reverse()));
app.put("/api/admin/products/:id",admin,(req,res)=>{
  const all=products(); const p=all.find(x=>x.id===req.params.id); if(!p)return res.status(404).json({error:"Product not found."});
  const {name,description,category,priceNaira,active}=req.body||{};
  if(typeof name==="string" && name.trim())p.name=name.trim().slice(0,100);
  if(typeof description==="string")p.description=description.slice(0,500);
  if(typeof category==="string" && category.trim())p.category=category.trim().slice(0,80);
  if(priceNaira===null || priceNaira==="")p.priceKobo=null;
  else if(priceNaira!==undefined){const n=Number(priceNaira);if(!Number.isFinite(n)||n<1||n>100000000)return res.status(400).json({error:"Enter a valid price in Naira."});p.priceKobo=Math.round(n*100);}
  if(typeof active==="boolean")p.active=active;
  writeJson(PRODUCTS,all);res.json(p);
});
app.get("/admin", (req,res)=>res.sendFile(path.join(ROOT,"public","admin.html")));
app.get("*",(req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));
app.listen(PORT,()=>console.log(`B BOI COMPUTER'S store running on ${PORT}`));
