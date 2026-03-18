import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req,res){

  if(req.method === "GET"){

    const likes = await redis.hgetall("likes");
    return res.status(200).json(likes || {});

  }

  if(req.method === "POST"){

    const {id,action} = req.body;

    let count;

    if(action === "like"){
      count = await redis.hincrby("likes", id, 1);
    }

    if(action === "unlike"){
      count = await redis.hincrby("likes", id, -1);

      if(count < 0){
        await redis.hset("likes",{[id]:0});
        count = 0;
      }
    }

    res.status(200).json({likes:count});

  }

}