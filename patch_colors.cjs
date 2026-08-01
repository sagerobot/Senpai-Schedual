const fs = require('fs');
let content = fs.readFileSync('src/components/CatchUpQueue.tsx', 'utf-8');

// Replace in 2x1
content = content.replace(/fill=\[\#d434ff\]/g, 'fill-[#b0a4ff]');
content = content.replace(/text-\[\#d434ff\]/g, 'text-[#b0a4ff]');
content = content.replace(/bg-\[\#d434ff\]/g, 'bg-[#b0a4ff]');
content = content.replace(/bg-\[\#d434ff\]\/30/g, 'bg-[#b0a4ff]/30');
content = content.replace(/rgba\(212,52,255,0\.4\)/g, 'rgba(176,164,255,0.4)');
content = content.replace(/hover:border-\[\#d434ff\]/g, 'hover:border-[#b0a4ff]');
content = content.replace(/hover:from-\[\#c220ef\]/g, 'hover:from-[#8b31ff]');
content = content.replace(/hover:to-\[\#8b10b3\]/g, 'hover:to-[#5c1cba]');
content = content.replace(/from-\[\#b51ce0\]/g, 'from-[#8b31ff]');
content = content.replace(/to-\[\#8009a8\]/g, 'to-[#5c1cba]');

// 1x1 Progress ring addition
// Let's replace the whole inner content of the right side in 1x1
const renderQueueItemStart = content.indexOf('  const renderQueueItem = ');
const innerStart = content.indexOf('<div className="flex flex-1 flex-col min-w-0">', renderQueueItemStart);
const innerEnd = content.indexOf('</div>\n        </div>\n        \n        {(() => {', innerStart);

const newInner = `<div className="flex flex-1 flex-col min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-gray-100 text-[14px] leading-snug line-clamp-2 group-hover/card:text-[#b0a4ff] transition-colors pr-2">
                  {item.anime.title.english || item.anime.title.userPreferred}
                </h3>
                
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400 font-medium">
                  <span>{item.watched.length} / {item.airedCount} logged</span>
                  <span className="px-1.5 py-0.5 rounded border border-[#543bfa]/50 bg-[#543bfa]/20 text-[#b0a4ff] font-bold text-[9px] uppercase tracking-wider">
                    New
                  </span>
                  {item.anime.nextAiringEpisode && (
                    <span className="flex items-center gap-1 text-amber-500 ml-auto sm:ml-0 font-semibold truncate">
                      <Clock className="h-3 w-3 shrink-0" />
                      Next in {Math.ceil(item.anime.nextAiringEpisode.timeUntilAiring / 3600)}h
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Ring */}
              <div className="shrink-0 relative w-[42px] h-[42px] flex items-center justify-center border-[1.5px] border-[#2e1d52] rounded-full bg-[#05040a]">
                <svg className="w-[34px] h-[34px] -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[#1e1a2f]"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <path
                    className="text-[#b0a4ff] transition-all duration-1000 ease-out"
                    strokeDasharray={\`\${progress}, 100\`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-white font-bold text-[10px] leading-none">{Math.round(progress)}%</span>
                </div>
              </div>
            </div>
            
            {/* Progress Bar under text */}
            <div className="mt-auto flex flex-col gap-1.5 pb-2">
              <div className="flex gap-[2px] h-[4px] w-full">
                 {Array.from({ length: Math.min(item.airedCount, 40) }).map((_, idx) => (
                   <div key={idx} className={cn("h-full flex-1 rounded-full", item.watched.includes(idx + 1) ? "bg-[#b0a4ff]" : "bg-[#251b3a]")} />
                 ))}
                 {item.airedCount > 40 && <div className="h-full w-2 rounded-full bg-[#b0a4ff]/30" />}
              </div>
              <div className="flex justify-between items-center text-[10px] font-medium pt-0.5">
                <span className="text-gray-400">{Math.round(progress)}% overall progress</span>
                <span className="text-gray-400">{item.behindCount} left</span>
              </div>
            </div>
          </div>`;

content = content.substring(0, innerStart) + newInner + content.substring(innerEnd);

fs.writeFileSync('src/components/CatchUpQueue.tsx', content);
console.log('done');
