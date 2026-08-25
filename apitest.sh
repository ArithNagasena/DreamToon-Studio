set -u
B=http://localhost:4000/api
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1  (got $2, want $3)"; fail=$((fail+1)); fi; }

TOK=$(curl -s -X POST $B/auth/login -H 'content-type: application/json' -d '{"email":"nadia@studio.com","password":"password123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
A="Authorization: Bearer $TOK"

chk "FR7 login wrong password rejected" \
 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H 'content-type: application/json' -d '{"email":"nadia@studio.com","password":"nope"}')" 401
chk "FR7 register validates email" \
 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/register -H 'content-type: application/json' -d '{"name":"X","email":"bad","password":"password123"}')" 400
chk "auth required on library" "$(curl -s -o /dev/null -w '%{http_code}' $B/characters)" 401
chk "FR9 library lists seeded characters" \
 "$(curl -s $B/characters -H "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["items"]))')" 6
chk "FR9 search filters by name" \
 "$(curl -s "$B/characters?q=cow" -H "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["items"]))')" 1
chk "FR9 filter by type" \
 "$(curl -s "$B/characters?type=plant" -H "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["items"]))')" 2
chk "FR10 catalogue exposes 9 shapes" \
 "$(curl -s $B/characters/catalogue -H "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["shapes"]))')" 9
chk "FR5 palette has 18 named colours" \
 "$(curl -s $B/characters/catalogue -H "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["palette"]))')" 18

ID=$(curl -s -X POST $B/characters -H "$A" -H 'content-type: application/json' -d '{"shape":"quadruped","name":"Test Cow"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["character"]["_id"])')
chk "FR1 create returns an id" "$([ -n "$ID" ] && echo yes)" yes
chk "FR1 unknown shape rejected" \
 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/characters -H "$A" -H 'content-type: application/json' -d '{"shape":"dragon"}')" 400
chk "FR11 recolour one part only" \
 "$(curl -s -X PUT $B/characters/$ID -H "$A" -H 'content-type: application/json' -d '{"colors":{"ears":"Blush Pink"}}' | python3 -c 'import sys,json;c=json.load(sys.stdin)["character"];print(c["colors"]["ears"]+"/"+c["colors"]["body"])')" "Blush Pink/Snow"
chk "FR5 colour outside palette rejected" \
 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/characters/$ID -H "$A" -H 'content-type: application/json' -d '{"colors":{"ears":"Neon Puce"}}')" 400
chk "FR4 scale saved" \
 "$(curl -s -X PUT $B/characters/$ID -H "$A" -H 'content-type: application/json' -d '{"scale":0.7}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["character"]["scale"])')" 0.7
chk "FR4 scale out of range rejected" \
 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/characters/$ID -H "$A" -H 'content-type: application/json' -d '{"scale":9}')" 400
chk "FR13 export returns JSON payload" \
 "$(curl -s "$B/characters/$ID/export?format=json" -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["schema"])')" "character-designer/v1"
chk "FR6 delete soft-deletes" \
 "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $B/characters/$ID -H "$A")" 200
chk "FR6 deleted character gone from library" \
 "$(curl -s "$B/characters?q=Test%20Cow" -H "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["items"]))')" 0
chk "FR12 undo restores it" \
 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/characters/$ID/restore -H "$A")" 200
chk "FR12 restored character is back" \
 "$(curl -s "$B/characters?q=Test%20Cow" -H "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["items"]))')" 1

# ---- drag-and-drop elements and blank-canvas projects ----
chk "catalogue exposes the draggable element library"  "$(curl -s $B/characters/catalogue -H "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["elements"]))')" 10
chk "catalogue marks the blank canvas as a scratch shape"  "$(curl -s $B/characters/catalogue -H "$A" | python3 -c 'import sys,json;print(",".join(s["key"] for s in json.load(sys.stdin)["shapes"] if s.get("scratch")))')" blank

BID=$(curl -s -X POST $B/characters -H "$A" -H 'content-type: application/json' -d '{"shape":"blank","name":"Scratch Project"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["character"]["_id"])')
chk "blank canvas creates a custom-type project"  "$(curl -s $B/characters/$BID -H "$A" | python3 -c 'import sys,json;c=json.load(sys.stdin)["character"];print(c["type"]+"/"+str(len(c["elements"])))')" "custom/0"
chk "elements are saved and read back"  "$(curl -s -X PUT $B/characters/$BID -H "$A" -H 'content-type: application/json' -d '{"elements":[{"id":"a1","el":"star","x":40,"y":-30,"color":"Corn Yellow"},{"id":"a2","el":"leaf","x":-50,"y":20,"color":"Meadow Green"}]}' | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["character"]["elements"]))')" 2
chk "element position survives a reload"  "$(curl -s $B/characters/$BID -H "$A" | python3 -c 'import sys,json;e=json.load(sys.stdin)["character"]["elements"][0];print(str(e["x"])+","+str(e["y"]))')" "40,-30"
chk "unknown element kind rejected"  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/characters/$BID -H "$A" -H 'content-type: application/json' -d '{"elements":[{"id":"b1","el":"dragon"}]}')" 400
chk "element colour outside palette rejected"  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/characters/$BID -H "$A" -H 'content-type: application/json' -d '{"elements":[{"id":"b1","el":"star","color":"Neon Puce"}]}')" 400
chk "element position clamped to the artboard"  "$(curl -s -X PUT $B/characters/$BID -H "$A" -H 'content-type: application/json' -d '{"elements":[{"id":"b1","el":"star","x":99999,"y":0,"color":"Snow"}]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["character"]["elements"][0]["x"])')" 260
chk "more than 60 elements rejected"  "$(python3 -c 'import json;print(json.dumps({"elements":[{"id":"z%d"%i,"el":"circle","color":"Snow"} for i in range(61)]}))' | curl -s -o /dev/null -w '%{http_code}' -X PUT $B/characters/$BID -H "$A" -H 'content-type: application/json' --data @-)" 400
# ---- artboard sized in centimetres ----
chk "catalogue publishes the canvas limits and cm scale"  "$(curl -s $B/characters/catalogue -H "$A" | python3 -c 'import sys,json;c=json.load(sys.stdin)["canvas"];print(str(c["limits"]["width"][0])+"-"+str(c["limits"]["width"][1])+"/"+str(c["unitsPerCm"]))')" "5-100/20"
chk "a preset shape gets the default 26 cm board"  "$(curl -s $B/characters/$ID -H "$A" | python3 -c 'import sys,json;c=json.load(sys.stdin)["character"]["canvas"];print(str(c["width"])+"x"+str(c["height"]))')" "26x26"
CID=$(curl -s -X POST $B/characters -H "$A" -H 'content-type: application/json' -d '{"shape":"blank","name":"Sized Project","canvas":{"width":12,"height":18}}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["character"]["_id"])')
chk "a scratch project keeps the canvas it was created with"  "$(curl -s $B/characters/$CID -H "$A" | python3 -c 'import sys,json;c=json.load(sys.stdin)["character"]["canvas"];print(str(c["width"])+"x"+str(c["height"]))')" "12x18"
chk "the canvas can be resized later"  "$(curl -s -X PUT $B/characters/$CID -H "$A" -H 'content-type: application/json' -d '{"canvas":{"width":30,"height":20}}' | python3 -c 'import sys,json;c=json.load(sys.stdin)["character"]["canvas"];print(str(c["width"])+"x"+str(c["height"]))')" "30x20"
chk "an oversized canvas is rejected"  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/characters/$CID -H "$A" -H 'content-type: application/json' -d '{"canvas":{"width":500,"height":20}}')" 400
chk "a canvas below the minimum is rejected"  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/characters/$CID -H "$A" -H 'content-type: application/json' -d '{"canvas":{"width":1,"height":20}}')" 400
# ---- placing the character on the board ----
chk "catalogue publishes the placement limits"  "$(curl -s $B/characters/catalogue -H "$A" | python3 -c 'import sys,json;o=json.load(sys.stdin)["offset"];print(str(o["limits"]["x"][0])+".."+str(o["limits"]["x"][1]))')" "-1000..1000"
chk "a new character starts centred"  "$(curl -s $B/characters/$CID -H "$A" | python3 -c 'import sys,json;o=json.load(sys.stdin)["character"]["offset"];print(str(o["x"])+","+str(o["y"])+","+str(o["z"]))')" "0,0,0"
chk "the character can be placed anywhere on the board"  "$(curl -s -X PUT $B/characters/$CID -H "$A" -H 'content-type: application/json' -d '{"offset":{"x":-140,"y":85,"z":-30}}' | python3 -c 'import sys,json;o=json.load(sys.stdin)["character"]["offset"];print(str(o["x"])+","+str(o["y"])+","+str(o["z"]))')" "-140,85,-30"
chk "placement survives a reload"  "$(curl -s $B/characters/$CID -H "$A" | python3 -c 'import sys,json;o=json.load(sys.stdin)["character"]["offset"];print(str(o["x"])+","+str(o["y"])+","+str(o["z"]))')" "-140,85,-30"
chk "a placement off the board is rejected"  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/characters/$CID -H "$A" -H 'content-type: application/json' -d '{"offset":{"x":99999,"y":0,"z":0}}')" 400
chk "placement is independent of element positions"  "$(curl -s -X PUT $B/characters/$CID -H "$A" -H 'content-type: application/json' -d '{"offset":{"x":20,"y":20,"z":0},"elements":[{"id":"p1","el":"star","x":60,"y":-60,"color":"Snow"}]}' | python3 -c 'import sys,json;c=json.load(sys.stdin)["character"];print(str(c["offset"]["x"])+"/"+str(c["elements"][0]["x"]))')" "20/60"
chk "FR13 export carries the placement"  "$(curl -s "$B/characters/$CID/export?format=json" -H "$A" | python3 -c 'import sys,json;o=json.load(sys.stdin)["offset"];print(str(o["x"])+","+str(o["y"]))')" "20,20"

chk "FR13 export states the board size and cm scale"  "$(curl -s "$B/characters/$CID/export?format=json" -H "$A" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(d["canvas"]["width"])+"x"+str(d["canvas"]["height"])+"@"+str(d["unitsPerCm"]))')" "30x20@20"

chk "FR13 export carries the placed elements"  "$(curl -s "$B/characters/$BID/export?format=json" -H "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["elements"]))')" 1

# NFR5 — a designer must not reach another designer's character
RTOK=$(curl -s -X POST $B/auth/login -H 'content-type: application/json' -d '{"email":"ruwan@studio.com","password":"password123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
RID=$(curl -s $B/characters -H "Authorization: Bearer $RTOK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["_id"])')
chk "NFR5 cannot read another designer's character" \
 "$(curl -s -o /dev/null -w '%{http_code}' $B/characters/$RID -H "$A")" 404
chk "FR14 designer blocked from admin" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/users -H "$A")" 403
chk "FR14 art lead lists designers" \
 "$(curl -s $B/admin/users -H "Authorization: Bearer $RTOK" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["users"]))')" 3
DID=$(curl -s $B/admin/users -H "Authorization: Bearer $RTOK" | python3 -c 'import sys,json;print([u for u in json.load(sys.stdin)["users"] if u["email"]=="ishara@studio.com"][0]["_id"])')
chk "FR14 deactivate a designer" \
 "$(curl -s -X PATCH $B/admin/users/$DID/status -H "Authorization: Bearer $RTOK" -H 'content-type: application/json' -d '{"status":"deactivated"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["user"]["status"])')" deactivated
chk "deactivated designer cannot log in" \
 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H 'content-type: application/json' -d '{"email":"ishara@studio.com","password":"password123"}')" 403
chk "FR14 art lead cannot deactivate self" \
 "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $B/admin/users/$(curl -s $B/auth/me -H "Authorization: Bearer $RTOK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["user"]["_id"])')/status -H "Authorization: Bearer $RTOK" -H 'content-type: application/json' -d '{"status":"deactivated"}')" 400

echo ""; echo "  ---- $pass passed, $fail failed ----"
