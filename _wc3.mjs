import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const contains=(k)=>({ name:{ contains:k, mode:'insensitive' } });
const all = await p.category.findMany({ select:{ id:true, name:true, parentId:true } });
const childrenMap=new Map(); for(const c of all){ if(c.parentId){(childrenMap.get(c.parentId)||childrenMap.set(c.parentId,[]).get(c.parentId)).push(c.id);} }
const wc = all.find(c=>c.name==="Women's Clothing" && !c.parentId);
const sub=[wc.id]; const q=[wc.id]; while(q.length){const cur=q.shift(); for(const ch of (childrenMap.get(cur)||[])){sub.push(ch);q.push(ch);}}
const nameById=new Map(all.map(c=>[c.id,c.name]));
// CONFIRMED-exotic only (excludes fashion terms bustier/babydoll/chemise)
const EXOTIC = ['pole dance','exotic dance','stripper','crotchless','open crotch','open-crotch','bodystocking','lingerie','negligee','g-string','cupless','peephole','garter belt','micro bikini','sexy costume','erotic'];
const EXCLUDE = ['scarf','scarves','wedding','bridal','mask','cloth','chef','baby ','kids','children','girls','boys'];
const where = { categoryId:{ in: sub }, AND:[{OR:EXOTIC.map(contains)},{NOT:{OR:EXCLUDE.map(contains)}}] };
const rows = await p.product.findMany({ where, select:{id:true,cjPid:true,name:true, categoryId:true} });
console.log('Confirmed-exotic in Women\'s Clothing:', rows.length);
rows.forEach(r=>console.log('   - ['+(nameById.get(r.categoryId))+'] '+r.name.slice(0,58)));
if(APPLY && rows.length){
  await p.moderationLog.createMany({ data: rows.map(r=>({cjPid:r.cjPid,name:r.name,categoryName:nameById.get(r.categoryId)||null,flaggedKeyword:'womens-exotic'})) });
  await p.product.deleteMany({ where:{ id:{ in: rows.map(r=>r.id) } } });
  console.log('-> moved', rows.length);
}
await p.$disconnect();
