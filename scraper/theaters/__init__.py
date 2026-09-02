from . import roxie, alamo, veezi, bampfa, grandlake, stanford, lark

# Each entry: (theater_id, scrape function)
SCRAPERS = [
    ("roxie", roxie.scrape),
    ("newmission", alamo.scrape),
    ("balboa", lambda: veezi.scrape("balboa", "52wkfzmjpwjjfpz3ye7tz8wscg")),
    ("4star", lambda: veezi.scrape("4star", "d2atbcege5knqsavntt91g1250")),
    ("bampfa", bampfa.scrape),
    ("grandlake", grandlake.scrape),
    ("stanford", stanford.scrape),
    ("lark", lark.scrape),
]
