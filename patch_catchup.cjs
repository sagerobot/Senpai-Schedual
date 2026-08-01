const fs = require('fs');
const content = fs.readFileSync('src/components/MockupsView.tsx', 'utf8');

const catchUpQueueSection = `
      <section className="space-y-6 pt-8 border-t border-gray-800">
        <div>
          <h2 className="text-xl font-bold text-white">Catch Up Queue</h2>
          <p className="text-sm text-gray-500 mb-4">
            A compact, action-oriented list of episodes the user is behind on, prioritized by release date or watch status.
          </p>
        </div>

        <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 md:-mx-8 md:px-8 lg:-mx-12 lg:px-12 hide-scrollbar">
          {[
            {
              title: "Jujutsu Kaisen",
              ep: 11,
              titleEp: "降霊 (Séance)",
              behind: 2,
              airDate: "3 days ago"
            },
            {
              title: "Kaiju No. 8",
              ep: 4,
              titleEp: "Fortitude 9.8",
              behind: 1,
              airDate: "Yesterday"
            },
            {
              title: "Frieren: Beyond Journey's End",
              ep: 28,
              titleEp: "It Would Be Embarrassing When We Met Again",
              behind: 4,
              airDate: "1 week ago"
            }
          ].map((item, idx) => (
            <div key={idx} className="group flex items-center gap-4 p-3 pr-4 rounded-xl bg-[#13141c] border border-gray-800/60 hover:border-gray-700 hover:bg-[#181922] transition-all shrink-0 w-[500px]">
              {/* Thumbnail */}
              <div className="relative w-32 h-20 shrink-0 rounded-lg overflow-hidden bg-[#0c0d14]">
                <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[13px] font-medium text-gray-400">
                  {item.title}
                </div>
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-white">
                  24m
                </div>
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[15px] font-bold text-gray-100 truncate">{item.title}</h3>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                    {item.behind} eps behind
                  </span>
                </div>
                <div className="text-[13px] text-gray-400 truncate mb-1">
                  <span className="text-gray-200 font-medium">Episode {item.ep}</span> • {item.titleEp}
                </div>
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Aired {item.airDate}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 bg-transparent text-[13px] font-medium text-gray-300 hover:bg-gray-800 transition-colors">
                  <Check className="w-4 h-4" /> Mark Watched
                </button>
                <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-indigo-500/30 bg-[#242145]/80 text-[13px] font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors">
                  <Play className="w-4 h-4 fill-current" /> Watch
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
`;

const regex = /<section className="space-y-6 pt-8 border-t border-gray-800">\s*<div>\s*<h2 className="text-xl font-bold text-white">Catch Up Queue<\/h2>[\s\S]*?(?=<\/div>\s*\);\s*})/m;

let replaced = content.replace(regex, catchUpQueueSection + '    ');

if (replaced === content) {
  console.log("Failed to match Regex");
} else {
  fs.writeFileSync('src/components/MockupsView.tsx', replaced);
  console.log("Success");
}
