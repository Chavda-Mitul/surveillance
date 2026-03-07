import axios from "axios";
import { redis } from "../lib/redis";
import {TLESatellite} from '../schema/satellite';

const CACHE_KEY = "satellites";
const CACHE_TTL = 60 * 60 * 12; // 12 hours
const URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE";

function parseTLE(data: string): TLESatellite[] {
  const lines = data.trim().split('\n');
  const satellites: TLESatellite[] = [];
  
  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 < lines.length) {
      satellites.push({
        name: lines[i].trim(),
        line1: lines[i + 1].trim(),
        line2: lines[i + 2].trim(),
      });
    }
  }
  
  return satellites;
}

export async function updateSatelliteCache(): Promise<TLESatellite[]> {
  const res = await axios.get(URL, { responseType: 'text' });
  const data = parseTLE(res.data);

  await redis.set(CACHE_KEY, JSON.stringify(data), {
    EX: CACHE_TTL,
  });

  console.log("Satellite cache updated");

  return data;
}

async function getSatelliteCache(): Promise<TLESatellite[] | null> {
  const cached = await redis.get(CACHE_KEY);

  if (!cached) return null;

  return JSON.parse(cached) as TLESatellite[];
} 

export async function getSatellite() : Promise<TLESatellite[] | null>{
    let data = await getSatelliteCache();

    if(!data){
      data = await updateSatelliteCache();
    }
    return data;
}
