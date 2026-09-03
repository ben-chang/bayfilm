from . import (roxie, alamo, veezi, bampfa, grandlake, stanford, lark, webedia,
               fandango, cinelux, pruneyard, cinemark, cafilm, cinelounge)

LANDMARK = "https://www.landmarktheatres.com"
LANDMARK_IDS = ("X00U8", "X00Y7", "X00TM")  # Opera Plaza, Piedmont, Aquarius

# Each entry: (theater_id, scrape function)
SCRAPERS = [
    ("roxie", roxie.scrape),
    ("newmission", lambda: alamo.scrape("newmission", "new-mission")),
    ("alamomv", lambda: alamo.scrape("alamomv", "mountain-view")),
    ("balboa", lambda: veezi.scrape("balboa", "52wkfzmjpwjjfpz3ye7tz8wscg")),
    ("4star", lambda: veezi.scrape("4star", "d2atbcege5knqsavntt91g1250")),
    ("bampfa", bampfa.scrape),
    ("grandlake", grandlake.scrape),
    ("stanford", stanford.scrape),
    ("lark", lark.scrape),
    ("rafael", lambda: cafilm.scrape("rafael", "RAF")),
    ("sequoia", lambda: cafilm.scrape("sequoia", "Sequoia")),
    ("cinelounge", cinelounge.scrape),
    ("vogue", lambda: veezi.scrape("vogue", "qkwymq4me4nthdzzgj9fe08j0r")),
    ("marina", lambda: fandango.scrape("marina", "AAUVR")),
    ("presidio", lambda: fandango.scrape("presidio", "AACFS")),
    ("vine", lambda: webedia.scrape("vine", "https://www.vinecinema.com", "X018Q")),
    ("operaplaza", lambda: webedia.scrape("operaplaza", LANDMARK, "X00U8", LANDMARK_IDS)),
    ("piedmont", lambda: webedia.scrape("piedmont", LANDMARK, "X00Y7", LANDMARK_IDS)),
    ("aquarius", lambda: webedia.scrape("aquarius", LANDMARK, "X00TM", LANDMARK_IDS)),
    ("almaden", lambda: cinelux.scrape("almaden", "cinelux-almaden-cafe-lounge")),
    ("pruneyard", pruneyard.scrape),
    ("santanarow", lambda: cinemark.scrape(
        "santanarow",
        "https://www.cinemark.com/theatres/ca-san-jose/cinemark-cinearts-santana-row")),
]
