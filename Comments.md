# Comments based on user testing after PR #90
There is an error when running the docker stack (docker compose logs server):

server-1  | Node.js v20.20.0
server-1  | {"level":30,"time":1772385917836,"pid":1,"hostname":"763ec6d54067","msg":"MongoDB connected"}
server-1  | node:fs:1386
server-1  |   const result = binding.mkdir(
server-1  |                          ^
server-1  | 
server-1  | Error: EACCES: permission denied, mkdir '/app/uploads'
server-1  |     at Object.mkdirSync (node:fs:1386:26)
server-1  |     at uploadPlugin (file:///app/src/plugins/upload.js:17:8)
server-1  |     at process.processTicksAndRejections (node:internal/process/task_queues:95:5) {
server-1  |   errno: -13,
server-1  |   code: 'EACCES',
server-1  |   syscall: 'mkdir',
server-1  |   path: '/app/uploads'
server-1  | }

