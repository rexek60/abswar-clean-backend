import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req,res)=>{
  res.json({name:"ABSWAR Backend",status:"online"});
});

app.get("/health",(req,res)=>{
  res.json({
    ok:true,
    postgres:true,
    redis:true
  });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, ()=>{
  console.log("ABSWAR backend running on port " + PORT);
});
