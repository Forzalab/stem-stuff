"""aiw.py: stdlib Python port of the avoid-ai-writing detector (P4.1b, the gate's no-AI-writing lint).

Source: conorbronsdon/avoid-ai-writing @013d1db, detector/patterns.js (MIT, Conor Bronsdon; vendored unchanged at
vendor/avoid-ai-writing/patterns.js for the differential test and the authoring lab).

    analyze_text(text, options=None) -> dict    same result as AIDetector.analyzeText(text, options): score, label,
                                                issues (type/text/index/severity/suggestion), stats, the trinary fields
                                                and the sentence highlight regions. Offsets are UTF-16 code units, as in JS.
    lint_view_strings(strings, context=None)   the gate's per-string verdict for short UI copy (see LINT_* below).

How the port stays faithful (tests/test_aiw.py checks it against the vendored JS):
- Every regex keeps its JS source text and goes through jsre(), which rewrites JS regex semantics into Python's:
  ASCII \\b \\w \\d (re.ASCII), JS \\s (Unicode spaces + U+FEFF), '.' without line terminators, '^'/'$' with and
  without /m (JS /m also breaks lines at \\r, U+2028, U+2029), \\p{...} from tables generated from node, lookbehind
  alternatives of different widths split into one lookbehind each, case folding ASCII-only outside /u.
- Text is processed as UTF-16 code units (astral characters split into surrogate pairs), so slices, lengths, indexes
  and fixed-size windows equal the JS ones; /u regexes take a surrogate pair as one character.
- exec/test/match/replace keep JS lastIndex rules (empty match advances by one), toFixed rounds half away from zero on
  the exact double, Math.round rounds half up.
No dependency, no network, no I/O at import.
"""
import math
import re
import sys
from decimal import ROUND_HALF_UP, Decimal

__all__ = ["analyze_text", "normalize_text", "get_label", "lint_view_strings", "jsre", "TYPE_LABELS", "SEVERITY_LABELS"]

# Unicode property ranges as node 22 (Unicode 16.0) sees them, generated once from the JS regex engine
_U_L = (
    '41-5a 61-7a aa b5 ba c0-d6 d8-f6 f8-2c1 2c6-2d1 2e0-2e4 2ec 2ee 370-374 376-377 37a-37d 37f 386 388-38a 38c 38e-3a1 '
    '3a3-3f5 3f7-481 48a-52f 531-556 559 560-588 5d0-5ea 5ef-5f2 620-64a 66e-66f 671-6d3 6d5 6e5-6e6 6ee-6ef 6fa-6fc 6ff 710 '
    '712-72f 74d-7a5 7b1 7ca-7ea 7f4-7f5 7fa 800-815 81a 824 828 840-858 860-86a 870-887 889-88e 8a0-8c9 904-939 93d 950 '
    '958-961 971-980 985-98c 98f-990 993-9a8 9aa-9b0 9b2 9b6-9b9 9bd 9ce 9dc-9dd 9df-9e1 9f0-9f1 9fc a05-a0a a0f-a10 a13-a28 '
    'a2a-a30 a32-a33 a35-a36 a38-a39 a59-a5c a5e a72-a74 a85-a8d a8f-a91 a93-aa8 aaa-ab0 ab2-ab3 ab5-ab9 abd ad0 ae0-ae1 af9 '
    'b05-b0c b0f-b10 b13-b28 b2a-b30 b32-b33 b35-b39 b3d b5c-b5d b5f-b61 b71 b83 b85-b8a b8e-b90 b92-b95 b99-b9a b9c b9e-b9f '
    'ba3-ba4 ba8-baa bae-bb9 bd0 c05-c0c c0e-c10 c12-c28 c2a-c39 c3d c58-c5a c5d c60-c61 c80 c85-c8c c8e-c90 c92-ca8 caa-cb3 '
    'cb5-cb9 cbd cdd-cde ce0-ce1 cf1-cf2 d04-d0c d0e-d10 d12-d3a d3d d4e d54-d56 d5f-d61 d7a-d7f d85-d96 d9a-db1 db3-dbb dbd '
    'dc0-dc6 e01-e30 e32-e33 e40-e46 e81-e82 e84 e86-e8a e8c-ea3 ea5 ea7-eb0 eb2-eb3 ebd ec0-ec4 ec6 edc-edf f00 f40-f47 '
    'f49-f6c f88-f8c 1000-102a 103f 1050-1055 105a-105d 1061 1065-1066 106e-1070 1075-1081 108e 10a0-10c5 10c7 10cd 10d0-10fa '
    '10fc-1248 124a-124d 1250-1256 1258 125a-125d 1260-1288 128a-128d 1290-12b0 12b2-12b5 12b8-12be 12c0 12c2-12c5 12c8-12d6 '
    '12d8-1310 1312-1315 1318-135a 1380-138f 13a0-13f5 13f8-13fd 1401-166c 166f-167f 1681-169a 16a0-16ea 16f1-16f8 1700-1711 '
    '171f-1731 1740-1751 1760-176c 176e-1770 1780-17b3 17d7 17dc 1820-1878 1880-1884 1887-18a8 18aa 18b0-18f5 1900-191e '
    '1950-196d 1970-1974 1980-19ab 19b0-19c9 1a00-1a16 1a20-1a54 1aa7 1b05-1b33 1b45-1b4c 1b83-1ba0 1bae-1baf 1bba-1be5 '
    '1c00-1c23 1c4d-1c4f 1c5a-1c7d 1c80-1c8a 1c90-1cba 1cbd-1cbf 1ce9-1cec 1cee-1cf3 1cf5-1cf6 1cfa 1d00-1dbf 1e00-1f15 '
    '1f18-1f1d 1f20-1f45 1f48-1f4d 1f50-1f57 1f59 1f5b 1f5d 1f5f-1f7d 1f80-1fb4 1fb6-1fbc 1fbe 1fc2-1fc4 1fc6-1fcc 1fd0-1fd3 '
    '1fd6-1fdb 1fe0-1fec 1ff2-1ff4 1ff6-1ffc 2071 207f 2090-209c 2102 2107 210a-2113 2115 2119-211d 2124 2126 2128 212a-212d '
    '212f-2139 213c-213f 2145-2149 214e 2183-2184 2c00-2ce4 2ceb-2cee 2cf2-2cf3 2d00-2d25 2d27 2d2d 2d30-2d67 2d6f 2d80-2d96 '
    '2da0-2da6 2da8-2dae 2db0-2db6 2db8-2dbe 2dc0-2dc6 2dc8-2dce 2dd0-2dd6 2dd8-2dde 2e2f 3005-3006 3031-3035 303b-303c '
    '3041-3096 309d-309f 30a1-30fa 30fc-30ff 3105-312f 3131-318e 31a0-31bf 31f0-31ff 3400-4dbf 4e00-a48c a4d0-a4fd a500-a60c '
    'a610-a61f a62a-a62b a640-a66e a67f-a69d a6a0-a6e5 a717-a71f a722-a788 a78b-a7cd a7d0-a7d1 a7d3 a7d5-a7dc a7f2-a801 '
    'a803-a805 a807-a80a a80c-a822 a840-a873 a882-a8b3 a8f2-a8f7 a8fb a8fd-a8fe a90a-a925 a930-a946 a960-a97c a984-a9b2 a9cf '
    'a9e0-a9e4 a9e6-a9ef a9fa-a9fe aa00-aa28 aa40-aa42 aa44-aa4b aa60-aa76 aa7a aa7e-aaaf aab1 aab5-aab6 aab9-aabd aac0 aac2 '
    'aadb-aadd aae0-aaea aaf2-aaf4 ab01-ab06 ab09-ab0e ab11-ab16 ab20-ab26 ab28-ab2e ab30-ab5a ab5c-ab69 ab70-abe2 ac00-d7a3 '
    'd7b0-d7c6 d7cb-d7fb f900-fa6d fa70-fad9 fb00-fb06 fb13-fb17 fb1d fb1f-fb28 fb2a-fb36 fb38-fb3c fb3e fb40-fb41 fb43-fb44 '
    'fb46-fbb1 fbd3-fd3d fd50-fd8f fd92-fdc7 fdf0-fdfb fe70-fe74 fe76-fefc ff21-ff3a ff41-ff5a ff66-ffbe ffc2-ffc7 ffca-ffcf '
    'ffd2-ffd7 ffda-ffdc 10000-1000b 1000d-10026 10028-1003a 1003c-1003d 1003f-1004d 10050-1005d 10080-100fa 10280-1029c '
    '102a0-102d0 10300-1031f 1032d-10340 10342-10349 10350-10375 10380-1039d 103a0-103c3 103c8-103cf 10400-1049d 104b0-104d3 '
    '104d8-104fb 10500-10527 10530-10563 10570-1057a 1057c-1058a 1058c-10592 10594-10595 10597-105a1 105a3-105b1 105b3-105b9 '
    '105bb-105bc 105c0-105f3 10600-10736 10740-10755 10760-10767 10780-10785 10787-107b0 107b2-107ba 10800-10805 10808 '
    '1080a-10835 10837-10838 1083c 1083f-10855 10860-10876 10880-1089e 108e0-108f2 108f4-108f5 10900-10915 10920-10939 '
    '10980-109b7 109be-109bf 10a00 10a10-10a13 10a15-10a17 10a19-10a35 10a60-10a7c 10a80-10a9c 10ac0-10ac7 10ac9-10ae4 '
    '10b00-10b35 10b40-10b55 10b60-10b72 10b80-10b91 10c00-10c48 10c80-10cb2 10cc0-10cf2 10d00-10d23 10d4a-10d65 10d6f-10d85 '
    '10e80-10ea9 10eb0-10eb1 10ec2-10ec4 10f00-10f1c 10f27 10f30-10f45 10f70-10f81 10fb0-10fc4 10fe0-10ff6 11003-11037 '
    '11071-11072 11075 11083-110af 110d0-110e8 11103-11126 11144 11147 11150-11172 11176 11183-111b2 111c1-111c4 111da 111dc '
    '11200-11211 11213-1122b 1123f-11240 11280-11286 11288 1128a-1128d 1128f-1129d 1129f-112a8 112b0-112de 11305-1130c '
    '1130f-11310 11313-11328 1132a-11330 11332-11333 11335-11339 1133d 11350 1135d-11361 11380-11389 1138b 1138e 11390-113b5 '
    '113b7 113d1 113d3 11400-11434 11447-1144a 1145f-11461 11480-114af 114c4-114c5 114c7 11580-115ae 115d8-115db 11600-1162f '
    '11644 11680-116aa 116b8 11700-1171a 11740-11746 11800-1182b 118a0-118df 118ff-11906 11909 1190c-11913 11915-11916 '
    '11918-1192f 1193f 11941 119a0-119a7 119aa-119d0 119e1 119e3 11a00 11a0b-11a32 11a3a 11a50 11a5c-11a89 11a9d 11ab0-11af8 '
    '11bc0-11be0 11c00-11c08 11c0a-11c2e 11c40 11c72-11c8f 11d00-11d06 11d08-11d09 11d0b-11d30 11d46 11d60-11d65 11d67-11d68 '
    '11d6a-11d89 11d98 11ee0-11ef2 11f02 11f04-11f10 11f12-11f33 11fb0 12000-12399 12480-12543 12f90-12ff0 13000-1342f '
    '13441-13446 13460-143fa 14400-14646 16100-1611d 16800-16a38 16a40-16a5e 16a70-16abe 16ad0-16aed 16b00-16b2f 16b40-16b43 '
    '16b63-16b77 16b7d-16b8f 16d40-16d6c 16e40-16e7f 16f00-16f4a 16f50 16f93-16f9f 16fe0-16fe1 16fe3 17000-187f7 18800-18cd5 '
    '18cff-18d08 1aff0-1aff3 1aff5-1affb 1affd-1affe 1b000-1b122 1b132 1b150-1b152 1b155 1b164-1b167 1b170-1b2fb 1bc00-1bc6a '
    '1bc70-1bc7c 1bc80-1bc88 1bc90-1bc99 1d400-1d454 1d456-1d49c 1d49e-1d49f 1d4a2 1d4a5-1d4a6 1d4a9-1d4ac 1d4ae-1d4b9 1d4bb '
    '1d4bd-1d4c3 1d4c5-1d505 1d507-1d50a 1d50d-1d514 1d516-1d51c 1d51e-1d539 1d53b-1d53e 1d540-1d544 1d546 1d54a-1d550 '
    '1d552-1d6a5 1d6a8-1d6c0 1d6c2-1d6da 1d6dc-1d6fa 1d6fc-1d714 1d716-1d734 1d736-1d74e 1d750-1d76e 1d770-1d788 1d78a-1d7a8 '
    '1d7aa-1d7c2 1d7c4-1d7cb 1df00-1df1e 1df25-1df2a 1e030-1e06d 1e100-1e12c 1e137-1e13d 1e14e 1e290-1e2ad 1e2c0-1e2eb '
    '1e4d0-1e4eb 1e5d0-1e5ed 1e5f0 1e7e0-1e7e6 1e7e8-1e7eb 1e7ed-1e7ee 1e7f0-1e7fe 1e800-1e8c4 1e900-1e943 1e94b 1ee00-1ee03 '
    '1ee05-1ee1f 1ee21-1ee22 1ee24 1ee27 1ee29-1ee32 1ee34-1ee37 1ee39 1ee3b 1ee42 1ee47 1ee49 1ee4b 1ee4d-1ee4f 1ee51-1ee52 '
    '1ee54 1ee57 1ee59 1ee5b 1ee5d 1ee5f 1ee61-1ee62 1ee64 1ee67-1ee6a 1ee6c-1ee72 1ee74-1ee77 1ee79-1ee7c 1ee7e 1ee80-1ee89 '
    '1ee8b-1ee9b 1eea1-1eea3 1eea5-1eea9 1eeab-1eebb 20000-2a6df 2a700-2b739 2b740-2b81d 2b820-2cea1 2ceb0-2ebe0 2ebf0-2ee5d '
    '2f800-2fa1d 30000-3134a 31350-323af '
)
_U_M = (
    '300-36f 483-489 591-5bd 5bf 5c1-5c2 5c4-5c5 5c7 610-61a 64b-65f 670 6d6-6dc 6df-6e4 6e7-6e8 6ea-6ed 711 730-74a 7a6-7b0 '
    '7eb-7f3 7fd 816-819 81b-823 825-827 829-82d 859-85b 897-89f 8ca-8e1 8e3-903 93a-93c 93e-94f 951-957 962-963 981-983 9bc '
    '9be-9c4 9c7-9c8 9cb-9cd 9d7 9e2-9e3 9fe a01-a03 a3c a3e-a42 a47-a48 a4b-a4d a51 a70-a71 a75 a81-a83 abc abe-ac5 ac7-ac9 '
    'acb-acd ae2-ae3 afa-aff b01-b03 b3c b3e-b44 b47-b48 b4b-b4d b55-b57 b62-b63 b82 bbe-bc2 bc6-bc8 bca-bcd bd7 c00-c04 c3c '
    'c3e-c44 c46-c48 c4a-c4d c55-c56 c62-c63 c81-c83 cbc cbe-cc4 cc6-cc8 cca-ccd cd5-cd6 ce2-ce3 cf3 d00-d03 d3b-d3c d3e-d44 '
    'd46-d48 d4a-d4d d57 d62-d63 d81-d83 dca dcf-dd4 dd6 dd8-ddf df2-df3 e31 e34-e3a e47-e4e eb1 eb4-ebc ec8-ece f18-f19 f35 '
    'f37 f39 f3e-f3f f71-f84 f86-f87 f8d-f97 f99-fbc fc6 102b-103e 1056-1059 105e-1060 1062-1064 1067-106d 1071-1074 '
    '1082-108d 108f 109a-109d 135d-135f 1712-1715 1732-1734 1752-1753 1772-1773 17b4-17d3 17dd 180b-180d 180f 1885-1886 18a9 '
    '1920-192b 1930-193b 1a17-1a1b 1a55-1a5e 1a60-1a7c 1a7f 1ab0-1ace 1b00-1b04 1b34-1b44 1b6b-1b73 1b80-1b82 1ba1-1bad '
    '1be6-1bf3 1c24-1c37 1cd0-1cd2 1cd4-1ce8 1ced 1cf4 1cf7-1cf9 1dc0-1dff 20d0-20f0 2cef-2cf1 2d7f 2de0-2dff 302a-302f '
    '3099-309a a66f-a672 a674-a67d a69e-a69f a6f0-a6f1 a802 a806 a80b a823-a827 a82c a880-a881 a8b4-a8c5 a8e0-a8f1 a8ff '
    'a926-a92d a947-a953 a980-a983 a9b3-a9c0 a9e5 aa29-aa36 aa43 aa4c-aa4d aa7b-aa7d aab0 aab2-aab4 aab7-aab8 aabe-aabf aac1 '
    'aaeb-aaef aaf5-aaf6 abe3-abea abec-abed fb1e fe00-fe0f fe20-fe2f 101fd 102e0 10376-1037a 10a01-10a03 10a05-10a06 '
    '10a0c-10a0f 10a38-10a3a 10a3f 10ae5-10ae6 10d24-10d27 10d69-10d6d 10eab-10eac 10efc-10eff 10f46-10f50 10f82-10f85 '
    '11000-11002 11038-11046 11070 11073-11074 1107f-11082 110b0-110ba 110c2 11100-11102 11127-11134 11145-11146 11173 '
    '11180-11182 111b3-111c0 111c9-111cc 111ce-111cf 1122c-11237 1123e 11241 112df-112ea 11300-11303 1133b-1133c 1133e-11344 '
    '11347-11348 1134b-1134d 11357 11362-11363 11366-1136c 11370-11374 113b8-113c0 113c2 113c5 113c7-113ca 113cc-113d0 113d2 '
    '113e1-113e2 11435-11446 1145e 114b0-114c3 115af-115b5 115b8-115c0 115dc-115dd 11630-11640 116ab-116b7 1171d-1172b '
    '1182c-1183a 11930-11935 11937-11938 1193b-1193e 11940 11942-11943 119d1-119d7 119da-119e0 119e4 11a01-11a0a 11a33-11a39 '
    '11a3b-11a3e 11a47 11a51-11a5b 11a8a-11a99 11c2f-11c36 11c38-11c3f 11c92-11ca7 11ca9-11cb6 11d31-11d36 11d3a 11d3c-11d3d '
    '11d3f-11d45 11d47 11d8a-11d8e 11d90-11d91 11d93-11d97 11ef3-11ef6 11f00-11f01 11f03 11f34-11f3a 11f3e-11f42 11f5a 13440 '
    '13447-13455 1611e-1612f 16af0-16af4 16b30-16b36 16f4f 16f51-16f87 16f8f-16f92 16fe4 16ff0-16ff1 1bc9d-1bc9e 1cf00-1cf2d '
    '1cf30-1cf46 1d165-1d169 1d16d-1d172 1d17b-1d182 1d185-1d18b 1d1aa-1d1ad 1d242-1d244 1da00-1da36 1da3b-1da6c 1da75 1da84 '
    '1da9b-1da9f 1daa1-1daaf 1e000-1e006 1e008-1e018 1e01b-1e021 1e023-1e024 1e026-1e02a 1e08f 1e130-1e136 1e2ae 1e2ec-1e2ef '
    '1e4ec-1e4ef 1e5ee-1e5ef 1e8d0-1e8d6 1e944-1e94a e0100-e01ef '
)
_U_N = (
    '30-39 b2-b3 b9 bc-be 660-669 6f0-6f9 7c0-7c9 966-96f 9e6-9ef 9f4-9f9 a66-a6f ae6-aef b66-b6f b72-b77 be6-bf2 c66-c6f '
    'c78-c7e ce6-cef d58-d5e d66-d78 de6-def e50-e59 ed0-ed9 f20-f33 1040-1049 1090-1099 1369-137c 16ee-16f0 17e0-17e9 '
    '17f0-17f9 1810-1819 1946-194f 19d0-19da 1a80-1a89 1a90-1a99 1b50-1b59 1bb0-1bb9 1c40-1c49 1c50-1c59 2070 2074-2079 '
    '2080-2089 2150-2182 2185-2189 2460-249b 24ea-24ff 2776-2793 2cfd 3007 3021-3029 3038-303a 3192-3195 3220-3229 3248-324f '
    '3251-325f 3280-3289 32b1-32bf a620-a629 a6e6-a6ef a830-a835 a8d0-a8d9 a900-a909 a9d0-a9d9 a9f0-a9f9 aa50-aa59 abf0-abf9 '
    'ff10-ff19 10107-10133 10140-10178 1018a-1018b 102e1-102fb 10320-10323 10341 1034a 103d1-103d5 104a0-104a9 10858-1085f '
    '10879-1087f 108a7-108af 108fb-108ff 10916-1091b 109bc-109bd 109c0-109cf 109d2-109ff 10a40-10a48 10a7d-10a7e 10a9d-10a9f '
    '10aeb-10aef 10b58-10b5f 10b78-10b7f 10ba9-10baf 10cfa-10cff 10d30-10d39 10d40-10d49 10e60-10e7e 10f1d-10f26 10f51-10f54 '
    '10fc5-10fcb 11052-1106f 110f0-110f9 11136-1113f 111d0-111d9 111e1-111f4 112f0-112f9 11450-11459 114d0-114d9 11650-11659 '
    '116c0-116c9 116d0-116e3 11730-1173b 118e0-118f2 11950-11959 11bf0-11bf9 11c50-11c6c 11d50-11d59 11da0-11da9 11f50-11f59 '
    '11fc0-11fd4 12400-1246e 16130-16139 16a60-16a69 16ac0-16ac9 16b50-16b59 16b5b-16b61 16d70-16d79 16e80-16e96 1ccf0-1ccf9 '
    '1d2c0-1d2d3 1d2e0-1d2f3 1d360-1d378 1d7ce-1d7ff 1e140-1e149 1e2f0-1e2f9 1e4f0-1e4f9 1e5f1-1e5fa 1e8c7-1e8cf 1e950-1e959 '
    '1ec71-1ecab 1ecad-1ecaf 1ecb1-1ecb4 1ed01-1ed2d 1ed2f-1ed3d 1f100-1f10c 1fbf0-1fbf9 '
)
_U_Latin = (
    '41-5a 61-7a aa ba c0-d6 d8-f6 f8-2b8 2e0-2e4 1d00-1d25 1d2c-1d5c 1d62-1d65 1d6b-1d77 1d79-1dbe 1e00-1eff 2071 207f '
    '2090-209c 212a-212b 2132 214e 2160-2188 2c60-2c7f a722-a787 a78b-a7cd a7d0-a7d1 a7d3 a7d5-a7dc a7f2-a7ff ab30-ab5a '
    'ab5c-ab64 ab66-ab69 fb00-fb06 ff21-ff3a ff41-ff5a 10780-10785 10787-107b0 107b2-107ba 1df00-1df1e 1df25-1df2a '
)
_U_CJK = (
    'b7 305 323 2e80-2e99 2e9b-2ef3 2f00-2fd5 2ff0-2fff 3001-3003 3005-3011 3013-301f 3021-302d 3030-3035 3037-303f 3041-3096 '
    '3099-30ff 3190-319f 31c0-31e5 31ef-31ff 3220-3247 3280-32b0 32c0-32cb 32d0-3370 337b-337f 33e0-33fe 3400-4dbf 4e00-9fff '
    'a700-a707 f900-fa6d fa70-fad9 fe45-fe46 ff61-ff9f 16fe2-16fe3 16ff0-16ff1 1aff0-1aff3 1aff5-1affb 1affd-1affe '
    '1b000-1b122 1b132 1b150-1b152 1b155 1b164-1b167 1d360-1d371 1f200 1f250-1f251 20000-2a6df 2a700-2b739 2b740-2b81d '
    '2b820-2cea1 2ceb0-2ebe0 2ebf0-2ee5d 2f800-2fa1d 30000-3134a 31350-323af '
)


def _ranges(spec):
    out = []
    for part in "".join(spec).split():
        a, _, b = part.partition("-")
        out.append((int(a, 16), int(b or a, 16)))
    return out


def _merge(rs):
    rs = sorted(rs)
    out = []
    for a, b in rs:
        if out and a <= out[-1][1] + 1:
            if b > out[-1][1]:
                out[-1] = (out[-1][0], b)
        else:
            out.append((a, b))
    return out


def _complement(rs, top):
    out = []
    lo = 0
    for a, b in _merge(rs):
        if a > lo:
            out.append((lo, a - 1))
        lo = max(lo, b + 1)
    if lo <= top:
        out.append((lo, top))
    return out


_JS_WS = [(9, 13), (32, 32), (0xA0, 0xA0), (0x1680, 0x1680), (0x2000, 0x200A), (0x2028, 0x2029), (0x202F, 0x202F),
          (0x205F, 0x205F), (0x3000, 0x3000), (0xFEFF, 0xFEFF)]
_JS_W = [(48, 57), (65, 90), (95, 95), (97, 122)]
_JS_D = [(48, 57)]
_JS_LT = [(10, 10), (13, 13), (0x2028, 0x2029)]
_PROPS = {"L": _ranges(_U_L), "M": _ranges(_U_M), "N": _ranges(_U_N), "Latin": _ranges(_U_Latin),
          "CJK": _ranges(_U_CJK)}
_PROP_NAMES = {"L": "L", "Letter": "L", "M": "M", "Mark": "M", "N": "N", "Number": "N", "Script=Latin": "Latin",
               "sc=Latin": "Latin", "Script_Extensions=Han": "CJK", "Script_Extensions=Hiragana": "CJK",
               "Script_Extensions=Katakana": "CJK"}
WS = "".join(chr(c) for a, b in _JS_WS for c in range(a, b + 1))   # String.prototype.trim's set


def _esc(cp):
    return "\\x%02x" % cp if cp < 0x100 else "\\u%04x" % cp


def _bmp_class(rs):
    if not rs:
        return "(?!)"
    body = "".join(_esc(a) if a == b else _esc(a) + ("" if b == a + 1 else "-") + _esc(b) for a, b in rs)
    return "[" + body + "]"


def _astral_alts(rs):
    by = {}
    for a, b in rs:
        a = max(a, 0x10000)
        while a <= b:
            h = 0xD800 + ((a - 0x10000) >> 10)
            end = min(b, 0x10000 + ((h - 0xD800 + 1) << 10) - 1)
            by.setdefault(h, []).append((0xDC00 + ((a - 0x10000) & 0x3FF), 0xDC00 + ((end - 0x10000) & 0x3FF)))
            a = end + 1
    items = sorted(by.items())
    out = []
    i = 0
    while i < len(items):
        h, lows = items[i]
        j = i
        while j + 1 < len(items) and items[j + 1][0] == items[j][0] + 1 and items[j + 1][1] == lows:
            j += 1
        hs = _esc(h) if j == i else "[%s-%s]" % (_esc(h), _esc(items[j][0]))
        out.append(hs + _bmp_class(lows))
        i = j + 1
    return "|".join(out)


def _emit_set(rs, u):
    """a JS character set as Python regex: BMP class, plus (in /u) one alternative per astral block, tried first"""
    rs = _merge(rs)
    if not u:
        return _bmp_class([(a, min(b, 0xFFFF)) for a, b in rs if a <= 0xFFFF])
    bmp = _complement([(0xD800, 0xDFFF)] + _complement([(a, b) for a, b in rs if a <= 0xFFFF], 0xFFFF), 0xFFFF)
    bmp = [(a, min(b, 0xFFFF)) for a, b in bmp if a <= 0xFFFF]
    astral = [(a, b) for a, b in rs if b >= 0x10000]
    if not astral:
        return _bmp_class(bmp)
    alts = "(?=[\\ud800-\\udbff])(?:%s)" % _astral_alts(astral)
    return "(?:%s|%s)" % (alts, _bmp_class(bmp)) if bmp else alts


class _Tr:
    """JS regex source -> Python regex source"""

    def __init__(self, src, flags):
        self.s = src
        self.u = "u" in flags
        self.m = "m" in flags
        self.dotall = "s" in flags
        self.native = not (self.u and "i" in flags)   # compiled with re.ASCII: \b \w \d are the JS ones
        self.top = 0x10FFFF if self.u else 0xFFFF
        self.caret = "(?<![^\\n\\r\\u2028\\u2029])" if self.m else "\\A"
        self.dollar = "(?![^\\n\\r\\u2028\\u2029])" if self.m else "\\Z"

    def run(self):
        alts, i = self.alts(0)
        if i != len(self.s):
            raise ValueError("unbalanced ) in %r" % self.s)
        return "|".join(alts)

    def alts(self, i):
        alts = []
        cur = []
        s = self.s
        while i < len(s):
            c = s[i]
            if c == ")":
                break
            if c == "|":
                alts.append("".join(cur))
                cur = []
                i += 1
                continue
            if c == "(":
                t, i = self.group(i)
                cur.append(t)
                continue
            if c == "[":
                t, i = self.cls(i)
                cur.append(t)
                continue
            if c == "\\":
                t, i = self.escape(i)
                cur.append(t)
                continue
            if c == ".":
                cur.append(_emit_set([(0, self.top)] if self.dotall else _complement(_JS_LT, self.top), self.u))
            elif c == "^":
                cur.append(self.caret)
            elif c == "$":
                cur.append(self.dollar)
            else:
                cur.append(c)
            i += 1
        alts.append("".join(cur))
        return alts, i

    def group(self, i):
        s = self.s
        if s.startswith("(?<=", i) or s.startswith("(?<!", i):
            neg = s[i + 3] == "!"
            alts, j = self.alts(i + 4)
            self.expect(j)
            if neg:
                return "".join("(?!\\A)" if a == "\\A" else "(?<!%s)" % a for a in alts), j + 1
            parts = [a if a in ("\\A", self.caret) else "(?<=%s)" % a for a in alts]
            return (parts[0] if len(parts) == 1 else "(?:" + "|".join(parts) + ")"), j + 1
        for head, py in (("(?:", "(?:"), ("(?=", "(?="), ("(?!", "(?!")):
            if s.startswith(head, i):
                alts, j = self.alts(i + 3)
                self.expect(j)
                return py + "|".join(alts) + ")", j + 1
        if s.startswith("(?<", i):
            k = s.index(">", i)
            alts, j = self.alts(k + 1)
            self.expect(j)
            return "(?P<%s>" % s[i + 3:k] + "|".join(alts) + ")", j + 1
        alts, j = self.alts(i + 1)
        self.expect(j)
        return "(" + "|".join(alts) + ")", j + 1

    def expect(self, j):
        if j >= len(self.s) or self.s[j] != ")":
            raise ValueError("unclosed group in %r" % self.s)

    def prop(self, i):
        """at '\\p{' / '\\P{': (ranges, next index)"""
        k = self.s.index("}", i)
        name = self.s[i + 3:k]
        rs = _PROPS[_PROP_NAMES[name]]
        if self.s[i + 1] == "P":
            rs = _complement(rs, 0x10FFFF)
        return rs, k + 1

    def class_escape(self, i):
        """an escape that stands for a set: (ranges, next) or None"""
        c = self.s[i + 1]
        if c in "dDwWsS":
            base = {"d": _JS_D, "w": _JS_W, "s": _JS_WS}[c.lower()]
            return (base if c.islower() else _complement(base, self.top)), i + 2
        if c in "pP" and self.u:
            return self.prop(i)
        return None

    def char_escape(self, i, in_class):
        """an escape that stands for one code unit/point: (cp, next)"""
        s = self.s
        c = s[i + 1]
        simple = {"n": 10, "r": 13, "t": 9, "v": 11, "f": 12, "0": 0}
        if c in simple and not (c == "0" and i + 2 < len(s) and s[i + 2].isdigit()):
            return simple[c], i + 2
        if c == "b" and in_class:
            return 8, i + 2
        if c == "u":
            if s[i + 2] == "{" and self.u:
                k = s.index("}", i)
                return int(s[i + 3:k], 16), k + 1
            return int(s[i + 2:i + 6], 16), i + 6
        if c == "x":
            return int(s[i + 2:i + 4], 16), i + 4
        if c == "c":
            return ord(s[i + 2]) % 32, i + 3
        return ord(c), i + 2

    def escape(self, i):
        s = self.s
        c = s[i + 1]
        if c in "bB":
            if self.native:
                return "\\" + c, i + 2
            w = "[A-Za-z0-9_]"
            if c == "b":
                return "(?:(?<=%s)(?!%s)|(?<!%s)(?=%s))" % (w, w, w, w), i + 2
            return "(?:(?<=%s)(?=%s)|(?<!%s)(?!%s))" % (w, w, w, w), i + 2
        if c in "dwDW" and self.native and not self.u:
            return "\\" + c, i + 2
        st = self.class_escape(i)
        if st:
            return _emit_set(st[0], self.u), st[1]
        if c.isdigit() and c != "0":
            k = i + 1
            while k < len(s) and s[k].isdigit():
                k += 1
            return "(?:\\%s)" % s[i + 1:k], k
        if c == "k" and s[i + 2] == "<":
            k = s.index(">", i)
            return "(?P=%s)" % s[i + 3:k], k + 1
        cp, j = self.char_escape(i, False)
        return self.lit(cp), j

    def lit(self, cp):
        if cp > 0xFFFF:
            cp -= 0x10000
            return _esc(0xD800 + (cp >> 10)) + _esc(0xDC00 + (cp & 0x3FF))
        return _esc(cp) if not (chr(cp).isalnum() and cp < 128) else chr(cp)

    def cls(self, i):
        s = self.s
        i += 1
        neg = False
        if i < len(s) and s[i] == "^":
            neg = True
            i += 1
        rs = []
        while True:
            if i >= len(s):
                raise ValueError("unclosed class in %r" % s)
            if s[i] == "]":
                i += 1
                break
            item, i = self.class_atom(i)
            if isinstance(item, int) and i + 1 < len(s) and s[i] == "-" and s[i + 1] != "]":
                hi, k = self.class_atom(i + 1)
                if isinstance(hi, int):
                    rs.append((item, hi))
                    i = k
                    continue
            if isinstance(item, int):
                rs.append((item, item))
            else:
                rs.extend(item)
        if neg:
            rs = _complement(rs, self.top)
        return _emit_set(rs, self.u), i

    def class_atom(self, i):
        s = self.s
        if s[i] == "\\":
            st = self.class_escape(i)
            if st:
                return st
            return self.char_escape(i, True)
        cp = ord(s[i])
        if self.u and 0xD800 <= cp <= 0xDBFF and i + 1 < len(s) and 0xDC00 <= ord(s[i + 1]) <= 0xDFFF:
            return 0x10000 + ((cp - 0xD800) << 10) + (ord(s[i + 1]) - 0xDC00), i + 2
        return cp, i + 1


def jsre(source, flags=""):
    """translate a JS regex (source, flags) to a compiled Python pattern with the same matches on UTF-16 text"""
    py = _Tr(source, flags).run()
    pf = 0
    if "i" in flags:
        pf |= re.IGNORECASE
    if not ("u" in flags and "i" in flags):
        pf |= re.ASCII
    return re.compile(py, pf)


class RX:
    """a JS RegExp: same source and flags, JS exec/test/lastIndex semantics"""
    __slots__ = ("source", "flags", "p", "g", "y", "u", "lastIndex")

    def __init__(self, source, flags="", py=None):
        self.source = source
        self.flags = flags
        self.p = py if py is not None else jsre(source, flags)
        self.g = "g" in flags
        self.y = "y" in flags
        self.u = "u" in flags
        self.lastIndex = 0

    def exec(self, s):
        if self.g or self.y:
            if self.lastIndex > len(s):
                self.lastIndex = 0
                return None
            m = self.p.match(s, self.lastIndex) if self.y else self.p.search(s, self.lastIndex)
            if m is None:
                self.lastIndex = 0
                return None
            self.lastIndex = m.end()
            return m
        return self.p.match(s) if self.y else self.p.search(s)

    def test(self, s):
        return self.exec(s) is not None

    def all(self, s):
        """every match a global exec loop / matchAll / String.match would see (empty match advances one unit/point)"""
        pos = 0
        n = len(s)
        search = self.p.search
        while pos <= n:
            m = search(s, pos)
            if m is None:
                return
            yield m
            e = m.end()
            if e == m.start():
                e += 2 if self.u and e + 1 < n and "\ud800" <= s[e] <= "\udbff" and "\udc00" <= s[e + 1] <= "\udfff" else 1
            pos = e

    def match(self, s):
        """String.prototype.match: list of strings (g) or a match / None"""
        if self.g:
            return [m.group(0) for m in self.all(s)]
        return self.p.search(s)

    def count(self, s):
        return sum(1 for _ in self.all(s))

    def replace(self, s, fn):
        """String.prototype.replace with a function replacer (fn gets the match object)"""
        if not self.g:
            m = self.p.search(s)
            return s if m is None else s[:m.start()] + fn(m) + s[m.end():]
        out = []
        last = 0
        for m in self.all(s):
            out.append(s[last:m.start()])
            out.append(fn(m))
            last = m.end()
        out.append(s[last:])
        return "".join(out)

    def split(self, s):
        return self.p.split(s)


def R(source, flags=""):
    return RX(source, flags)


# ═══ JS runtime helpers ═══════════════════════════════════════════════

def js_trim(s):
    return s.strip(WS)


def js_round(x):
    f = math.floor(x)
    return int(f + 1 if x - f >= 0.5 else f)


def js_tofixed(x, d):
    if x == 0:
        x = 0.0
    q = Decimal(x).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP)
    return format(q, "f")



_ASTRAL = re.compile("[\U00010000-\U0010ffff]")
_SURR = re.compile("[\ud800-\udfff]")


def to_units(s):
    """astral characters -> surrogate pairs, so len/slices/indexes count UTF-16 code units like JS"""
    if not _ASTRAL.search(s):
        return s
    return _ASTRAL.sub(lambda m: (lambda o: chr(0xD800 + (o >> 10)) + chr(0xDC00 + (o & 0x3FF)))(ord(m.group()) - 0x10000), s)


def from_units(s):
    if not isinstance(s, str) or not _SURR.search(s):
        return s
    return s.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "surrogatepass")


def cps(s):
    """iterate code points of a UTF-16 unit string ([...s] in JS)"""
    i = 0
    n = len(s)
    while i < n:
        if "\ud800" <= s[i] <= "\udbff" and i + 1 < n and "\udc00" <= s[i + 1] <= "\udfff":
            yield s[i:i + 2]
            i += 2
        else:
            yield s[i]
            i += 1


def cp_len(s):
    return sum(1 for _ in cps(s))



# ═══ Detector (patterns.js @013d1db), same order and names as the JS ═══

# ─── Tier 1 pre-pass: normalize bypass tricks ───
CYRILLIC_LOOKALIKES = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x',
    'у': 'y', 'к': 'k', 'м': 'm', 'н': 'h', 'в': 'b', 'т': 't',
    'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C', 'Х': 'X',
    'У': 'Y', 'К': 'K', 'М': 'M', 'Н': 'H', 'В': 'B', 'Т': 'T',
}
GREEK_LOOKALIKES = {'ο': 'o', 'Ο': 'O', 'α': 'a', 'Α': 'A', 'ρ': 'p', 'Ρ': 'P'}
ZERO_WIDTH = frozenset('​‌‍﻿⁠')
HOMOGLYPH_RE = R('[Ѐ-ӿͰ-Ͽ]', 'u')
HOMOGLYPH_GLOBAL_RE = R('[Ѐ-ӿͰ-Ͽ]', 'gu')
LATIN_LETTER_RE = R(r'\p{Script=Latin}', 'u')
SENTENCE_UNIT_GLOBAL_RE = R(r'(?:[^.!?\r\n]|(?<=[A-Za-z0-9_])\.(?=[A-Za-z0-9_])|\r?\n(?![ \t]*(?:\r?\n|(?:[-*+]|#{1,6}|\d+[.)])\s|[><|]|`{3}|~{3}|(?:-+|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,}|=+)[\t ]*(?:\r?\n|$)|:?-+:?[\t ]*(?:\|[\t ]*:?-+:?[\t ]*)+\|?[\t ]*(?:\r?\n|$))))+', 'g')
LETTER_RUN_GLOBAL_RE = R(r'[\p{L}\p{M}]+', 'gu')
ROLEPLAY_VERBS_RE = R(r'^(?:nods|sighs|laughs|smiles|frowns|shrugs|grins|winks|chuckles|gasps|pauses|thinks|wonders|whispers|shouts|gestures|raises|leans|turns|looks|glances|smirks|blinks|nodding|sighing|laughing|smiling|thinking|gesturing)\b', 'i')
ROLEPLAY_MARKER_RE = R(r'(?<!\*)\*([^*\n]{1,80}?)\*(?!\*)', 'gu')
LETTER_END_RE = R(r'\p{L}$', 'u')
LETTER_START_RE = R(r'^\p{L}', 'u')
LETTER_ONE_RE = R(r'\p{L}', 'u')
LETTER_ALL_RE = R(r'\p{L}', 'gu')
MAX_ZERO_WIDTH_SKIP = 8


def counts_as_bypass(chars, i):
    if chars[i] != '⁠':
        return True
    before = i - 1
    while before >= 0 and i - before <= MAX_ZERO_WIDTH_SKIP and chars[before] in ZERO_WIDTH:
        before -= 1
    after = i + 1
    while after < len(chars) and after - i <= MAX_ZERO_WIDTH_SKIP and chars[after] in ZERO_WIDTH:
        after += 1
    return (LETTER_END_RE.test(chars[max(0, before - 1):max(0, before + 1)])
            and LETTER_START_RE.test(chars[after:after + 2]))


def _lookalike_for(m):
    return CYRILLIC_LOOKALIKES.get(m) or GREEK_LOOKALIKES.get(m)


def normalize_text(text, source_map=None):
    flags = {'zeroWidth': 0, 'homoglyph': 0, 'roleplay': 0}
    out = text
    mp = source_map

    # 1. zero-width characters
    chars = []
    next_map = []
    for i, ch in enumerate(out):
        if ch in ZERO_WIDTH:
            if counts_as_bypass(out, i):
                flags['zeroWidth'] += 1
            continue
        chars.append(ch)
        if mp is not None:
            next_map.append(mp[i])
    out = ''.join(chars)
    if mp is not None:
        mp = next_map

    # 2. Cyrillic / Greek lookalikes
    def swap(m):
        s = _lookalike_for(m.group(0))
        if s:
            flags['homoglyph'] += 1
            return s
        return m.group(0)

    def all_lookalike(word):
        return (LETTER_ALL_RE.count(word) >= 2
                and all(_lookalike_for(ch) or not LETTER_ONE_RE.test(ch) for ch in cps(word)))

    def unit_fn(um):
        unit = um.group(0)
        script = HOMOGLYPH_GLOBAL_RE.match(unit)
        only = len(script) > 0 and all(_lookalike_for(ch) for ch in script)
        result = []
        last = 0
        for wm in LETTER_RUN_GLOBAL_RE.all(unit):
            word = wm.group(0)
            nxt = word
            if HOMOGLYPH_RE.test(word):
                if LATIN_LETTER_RE.test(word) or (all_lookalike(word) and only):
                    nxt = HOMOGLYPH_GLOBAL_RE.replace(word, swap)
            result.append(unit[last:wm.start()])
            result.append(nxt)
            last = wm.start() + len(word)
        result.append(unit[last:])
        return ''.join(result)

    if HOMOGLYPH_RE.test(out):
        out = SENTENCE_UNIT_GLOBAL_RE.replace(out, unit_fn)

    # 3. *roleplay-action* markers
    if '*' in out:
        chars = []
        next_map = []
        cursor = 0
        for m in ROLEPLAY_MARKER_RE.all(out):
            if not ROLEPLAY_VERBS_RE.test(m.group(1)):
                continue
            chars.append(out[cursor:m.start()])
            if mp is not None:
                next_map.extend(mp[cursor:m.start()])
            flags['roleplay'] += 1
            cursor = m.end()
        if cursor or flags['roleplay']:
            chars.append(out[cursor:])
            if mp is not None:
                next_map.extend(mp[cursor:])
                mp = next_map
            out = ''.join(chars)
    res = {'text': out, 'flags': flags}
    if source_map is not None:
        res['sourceMap'] = mp
    return res


TECHNICAL_EXEMPT = frozenset([
    'robust', 'comprehensive', 'seamless', 'seamlessly', 'ecosystem', 'leverage', 'leverages', 'leveraging',
    'leveraged', 'facilitate', 'facilitates', 'underpin', 'underpinning', 'underpinnings', 'streamline',
])

TIER1 = {
    'delve': 'explore, dig into, look at',
    'tapestry': 'complex structure, rich history',
    'paradigm': 'model, approach, framework',
    'beacon': 'rewrite entirely',
    'robust': 'strong, reliable, solid',
    'comprehensive': 'thorough, complete, full',
    'cutting-edge': 'latest, newest, advanced',
    'pivotal': 'important, key, critical',
    'meticulous': 'careful, detailed, precise',
    'meticulously': 'carefully, precisely',
    'seamless': 'smooth, easy, without friction',
    'seamlessly': 'smoothly, easily',
    'game-changer': 'changes how [X] works',
    'game-changing': 'changes how [X] works',
    'nestled': 'is located, sits',
    'vibrant': 'lively, active',
    'thriving': 'growing, active',
    'bustling': 'busy, active',
    'intricate': 'complex, detailed',
    'intricacies': 'complexities, details',
    'ever-evolving': 'changing, growing',
    'enduring': 'lasting, long-running',
    'daunting': 'hard, difficult',
    'holistic': 'complete, full, whole',
    'holistically': 'completely, fully',
    'actionable': 'practical, useful, concrete',
    'impactful': 'effective, significant',
    'learnings': 'lessons, findings, takeaways',
    'synergy': 'combined effect, benefit of working together',
    'synergies': 'combined effect, benefit of working together',
    'interplay': 'relationship, connection',
    'symphony': 'coordination, balance',
    'embrace': 'adopt, accept, use',
}

FEATURES_NOUN_BEFORE_RE = R(r"(?:^|[.!?:;(]\s*|(?:^|\n)[ \t]*(?:[-*+>#]+[ \t]*)?|\b(?:the|a|an|these|those|its|their|our|your|my|his|her|of|or|new|key|main|core|top|other|more|most|many|several|some|all|any|few|no|both|only|about|over|just|free|similar|common|specific|distinct|additional|extra|premium|advanced|basic|best|unique|missing|upcoming|existing|latest|major|minor|useful|important|various|different|certain|such|\d+|two|three|four|five|six|seven|eight|nine|ten|whose)\s+|\w['’]s\s+|\w[-/]\w+\s+)$", 'i')
FEATURES_NOUN_AFTER_RE = R(r"""^(?:[ \t]*(?:[.,;:!?()[\]"'’”\n]|$)|\s+(?:of|for|in|on|at|into|and|or|but|nor|are|were|is|was|be|been|being|that|which|who|whose|like|such|to|from|with|without|than|help|helps|helped|let|allow|make|keep|give|provide|enable|offer|save|protect|ensure|improve|reduce|support|remain|vary|need|unlock|bring|include|includes|included|work|works|worked|will|can|could|should|would|may|might|must|do|did|does|have|has|had|we|you|they|i|it)(?![\w-]))""", 'i')
FEATURES_NOUN_OBJECT_RE = R(r'\b(?:i|we|you|they|teams?|developers?|engineers?|users?|companies|vendors|the\s+(?:release|update))\s+(?:(?:can|could|will|would|should|must)\s+)?(?:ship|ships|shipped|shipping|build|builds|built|building|add|adds|added|adding)\s+(?:[\w./-]+\s+)?$', 'i')
FEATURES_QUESTION_LEAD_RE = R(r"(?:^|[.!?:;]\s*|(?:^|\n)[ \t]*(?:[-*+>#]+[ \t]*)?|(?:^|[.!?:;,]\s*|(?:^|\n)[ \t]*(?:[-*+>#]+[ \t]*)?|\b(?:i|we|you|they|he|she|let['’]?s|to|can|could|should|must|will|would|please|just|then|first|now|and|or|but|so)\s+)(?:decide|decides|deciding|choose|choosing|pick|check|checking|see|know|knowing|learn|find\s+out|figure\s+out|work\s+out|identify|determine|ask|asking|asked|tell\s+(?:me|us|them|you)|show\s+(?:me|us|them|you)|understand|explain|wonder|discover|confirm|consider|evaluate|prioritize|about)\s+)(?:which|what)\s+$", 'i')
FEATURES_LEAD_AS_NOUN_RE = R(r'\b(?:a|an|the|this|that|these|those|my|our|your|their|its|his|her|each|every)\s+[\w-]+\s+(?:which|what)\s+$', 'i')
FEATURES_VERB_SUBJECTS = R(r'\b(?:library|tool|app|application|platform|system|language|service|product|update|release|version|site|website|game|device|model|framework|package|plugin|extension|which|what|that|who|it|he|she)\s+$', 'i')
_F_PRODUCT = R(r'\b([A-Z][\w]*)(?:[-/]\d[\w.-]*|[ \t]+\d+(?:\.\d+)*)[ \t]+$')
_F_ARTICLE_AFTER = R(r'^\s+(?:a|an|the)(?![\w-])', 'i')
_F_ASIDE = R(r'^[ \t]*,[^,\n]{1,80},\s*(?:a|an|the)(?![\w-])', 'i')
_F_SUBJECT = R(r'^\s+(?:a|an|the)\s+[\w-]+\s*(?:(?:and\b|or\b)\s+(?:a\s+|an\s+|the\s+)?(?:[\w-]+\s+){0,2}[\w-]+\s*)?(?:([,.!?;])|$)', 'i')
_F_PREDICATE_SRC = r'\b(?:can|could|should|will|would|may|might|must|is|are|was|were|has|have|had|do|does|did|include|includes|disable|disables|reject|accept|allow|deny|provide|require|use|make|work|help|give|take|need|become|seem|look|show|offer|support|supports|fail|pass|lack|prefer|choose|prevent|stop)\b'
_F_PREDICATE = R(_F_PREDICATE_SRC, 'i')
_F_REMAINDER = R(r'^[^,]+,\s*(?:(?:[\w-]+ly|also|not|never)\s+){0,2}' + _F_PREDICATE_SRC, 'i')
_WS_SPLIT = R(r'\s+')
_F_SUPPORT_FOR = R(r'^\s+support\s+for\b', 'i')
_F_PRONOUN = R(r'\b(?:it|he|she)\s+$', 'i')
_F_PLURAL_DET = R(r'\b(?:these|those|all|some|many|few|various|multiple|several|both)\s+(?:[\w-]+\s+){1,2}$', 'i')
_F_PLURAL_COUNT = R(r'\b(?:the|a|an|this|that|my|our|your|their|its|his|her|each|every)\s+(?:(?:\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|dozen)\s+(?:[\w-]+\s+){1,2}|(?!(?:19|20)\d{2}\s)\d{3,}\s+(?!(?:[\w-]+\s+)?(?:app|release|model|version|update)\s+$)(?:[\w-]+\s+){1,2})$', 'i')
_F_PARTITIVE = R(r'\b(?:all|some|many|most|few|several|both|\d+|two|three|four|five|six|seven|eight|nine|ten)\s+of\s+(?:the|my|our|your|their|its|his|her)\s+(?:[\w-]+\s+){1,3}$', 'i')
_F_PLURAL_PRED = R(r'^\s+support\s+for(?:(?!\b(?:that|which|who|whom|whose|where|when)\b)[^.?!;]){0,80}?\b(?:and|but|or|nor)\s+(?:are|were|have|do|reject|accept|allow|deny|provide|require|use|make|work|help|give|take|need|become|seem|look|show|include|offer|support|remain|fail|pass|lack|prefer|choose|prevent|stop)\b', 'i')
_F_FOR_OBJECT = R(r'^\s+support\s+for(?:-|\s+)(?:profit|loops?)\b', 'i')
_F_SINGULAR_A = R(r'\b(?:a|an|this|that|every|each|one)\s+(?:(?!(?:of|for|in|with|and|or|which|what|that|who|two|three|four|five|six|seven|eight|nine|ten|multiple|several|many|few|both|various)\b)[\w-]+\s+){1,3}$', 'i')
_F_SINGULAR_REL = R(r'\b(?:a|an|this|that|each|every|one)\s+[\w-]+\s+(?:which|that|who)\s+$', 'i')
_F_SINGULAR_THE = R(r'\b(?:the|my|our|your|their|its|his|her)\s+(?:(?!(?:of|for|in|with|and|or|which|what|that|who|two|three|four|five|six|seven|eight|nine|ten|multiple|several|many|few|both|various)\b)[\w-]+\s+){1,3}$', 'i')
_F_SINGULAR_THE_REL = R(r'\b(?:the|my|our|your|their|its|his|her)\s+[\w-]+\s+(?:which|that|who)\s+$', 'i')


def features_is_noun(text, index):
    end = index + len('features')
    before = text[max(0, index - 40):index]
    after = text[end:end + 40]
    if FEATURES_NOUN_OBJECT_RE.test(before):
        return True
    product = _F_PRODUCT.exec(before)
    if product and not FEATURES_NOUN_BEFORE_RE.test(product.group(1) + ' ') and _F_ARTICLE_AFTER.test(after):
        return False
    if not FEATURES_NOUN_BEFORE_RE.test(before) and _F_ASIDE.test(text[end:end + 110]):
        return False
    if FEATURES_QUESTION_LEAD_RE.test(before) and not FEATURES_LEAD_AS_NOUN_RE.test(before):
        match = _F_SUBJECT.exec(after)
        if match:
            m0 = match.group(0)
            p1 = match.group(1)
            subject_text = js_trim(m0[:-len(p1)] if p1 else m0)
            last_word = _WS_SPLIT.split(subject_text)[-1]
            if _F_PREDICATE.test(last_word):
                return True
            if p1 == ',':
                remainder = text[end + len(m0):end + 120]
                if _F_REMAINDER.test(remainder):
                    return True
            return False
        return True
    if FEATURES_VERB_SUBJECTS.test(before) and _F_SUPPORT_FOR.test(after):
        if _F_PRONOUN.test(before):
            return False
        has_plural_det = _F_PLURAL_DET.test(before)
        has_plural_count = _F_PLURAL_COUNT.test(before)
        extended_after = text[end:end + 100]
        has_partitive = _F_PARTITIVE.test(before)
        has_plural_pred = _F_PLURAL_PRED.test(extended_after)
        has_for_object = _F_FOR_OBJECT.test(after)
        has_unambiguous_singular = (_F_SINGULAR_A.test(before) or _F_PRONOUN.test(before)
                                    or _F_SINGULAR_REL.test(before))
        has_singular_evidence = (has_unambiguous_singular or _F_SINGULAR_THE.test(before)
                                 or _F_SINGULAR_THE_REL.test(before))
        if (not has_plural_det and not has_plural_count and not has_partitive and not has_plural_pred
                and (has_unambiguous_singular or (not has_for_object and has_singular_evidence))):
            return False
    return FEATURES_NOUN_BEFORE_RE.test(before) or FEATURES_NOUN_AFTER_RE.test(after)


def _p(pattern, replace, **kw):
    d = {'pattern': pattern, 'replace': replace, 'filter': False, 'clarity': False, 'skip': None}
    d.update(kw)
    return d


TIER1_PHRASES = [
    _p(R(r'\bdelve\s+into\b', 'gi'), 'explore, dig into'),
    _p(R(r'\blandscape\b', 'gi'), 'field, space, industry', filter=True),
    _p(R(r'\brealm\b', 'gi'), 'area, field, domain'),
    _p(R(r'\btestament\s+to\b', 'gi'), 'shows, proves'),
    _p(R(r'\bleverag(?:e|es|ing|ed)\b', 'gi'), 'use'),
    _p(R(r'\bwatershed\s+moment\b', 'gi'), 'turning point, shift'),
    _p(R(r'\bmarking\s+a\s+pivotal\s+moment\b', 'gi'), 'changing [X], leading to [Y]'),
    _p(R(r'\bthe\s+future\s+looks\s+bright\b', 'gi'), 'cut or say something specific'),
    _p(R(r'\bonly\s+time\s+will\s+tell\b', 'gi'), 'cut or say something specific'),
    _p(R(r'\bdespite\s+challenges[^.]*continues?\s+to\s+thrive\b', 'gi'), 'keeps growing despite [named difficulty], continues to succeed despite [named difficulty]'),
    _p(R(r'\bdeep\s+dive\b', 'gi'), 'look at, examine'),
    _p(R(r'\bdive\s+into\b', 'gi'), 'look at, examine'),
    _p(R(r'\bunpack(?:ing)?\b', 'gi'), 'explain, break down'),
    _p(R(r'\bcomplexities\b', 'gi'), 'problems, details'),
    _p(R(r'\bthought\s+leader(?:ship)?\b', 'gi'), 'expert, authority'),
    _p(R(r'\bbest\s+practices\b', 'gi'), 'what works, proven methods'),
    _p(R(r'\bat\s+its\s+core\b', 'gi'), 'cut, just state it'),
    _p(R(r'\bin\s+order\s+to\b', 'gi'), 'to', clarity=True),
    _p(R(r'\bdue\s+to\s+the\s+fact\s+that\b', 'gi'), 'because', clarity=True),
    _p(R(r'\bserves\s+as\b', 'gi'), 'is', clarity=True),
    _p(R(r'\bfeatures\b', 'gi'), 'has, includes', filter=True, clarity=True, skip=features_is_noun),
    _p(R(r'\bboasts\b', 'gi'), 'has', clarity=True),
    _p(R(r'\butiliz(?:e|es|ing|ed)\b', 'gi'), 'use', clarity=True),
    _p(R(r'\bshowcas(?:e|es|ing|ed)\b', 'gi'), 'show, demonstrate'),
    _p(R(r'\bembark(?:s|ing|ed)?\b', 'gi'), 'start, begin'),
    _p(R(r'\bcommenc(?:e|es|ing|ed)\b', 'gi'), 'start, begin', clarity=True),
    _p(R(r'\bascertain(?:s|ing|ed)?\b', 'gi'), 'find out, determine', clarity=True),
    _p(R(r'\bendeavou?r(?:s|ing|ed)?\b', 'gi'), 'effort, attempt, try', clarity=True),
    _p(R(r'\bunderscor(?:es|ing|ed)\b', 'gi'), 'highlights, shows'),
    _p(R(r'\bload-bearing\b(?=[ \t]+(?:assumptions?|claims?|invariants?|premises?|constraints?|dependenc(?:y|ies)|arguments?|abstractions?)\b)', 'gi'), 'essential, critical, or say what breaks if you remove it'),
]

TIER2 = {
    'harness': 'use, take advantage of',
    'navigate': 'work through, handle',
    'navigating': 'working through, handling',
    'foster': 'encourage, support, build',
    'elevate': 'improve, raise, strengthen',
    'unleash': 'release, enable, unlock',
    'streamline': 'simplify, speed up',
    'empower': 'enable, let, allow',
    'bolster': 'support, strengthen',
    'spearhead': 'lead, drive, run',
    'resonate': 'connect with, appeal to',
    'resonates': 'connects with, appeals to',
    'revolutionize': 'change, transform',
    'facilitate': 'enable, help, allow',
    'facilitates': 'enables, helps, allows',
    'underpin': 'support, form the basis of',
    'nuanced': 'specific, subtle, detailed',
    'crucial': 'important, key, necessary',
    'multifaceted': 'having several parts, with several aspects',
    'ecosystem': 'system, community, network',
    'myriad': 'many, numerous',
    'plethora': 'many, a lot of',
    'encompass': 'include, cover, span',
    'catalyze': 'start, trigger, accelerate',
    'reimagine': 'rethink, redesign, rebuild',
    'galvanize': 'motivate, rally, push',
    'augment': 'add to, expand, supplement',
    'cultivate': 'build, develop, grow',
    'illuminate': 'clarify, explain, show',
    'elucidate': 'explain, clarify',
    'juxtapose': 'compare, contrast',
    'transformative': 'changes how [X] works',
    'transformation': 'major change, overhaul',
    'cornerstone': 'foundation, basis, key part',
    'paramount': 'most important, top priority',
    'poised': 'ready, set, about to',
    'burgeoning': 'growing, emerging',
    'nascent': 'new, early-stage',
    'quintessential': 'typical, classic, defining',
    'overarching': 'main, central, broad',
    'quietly': 'cut, or name the concrete contrast',
    'underpinning': 'basis, foundation',
    'underpinnings': 'basis, foundations',
    'paradigm-shifting': 'changes the basic model, changes how [X] is understood',
}

TIER2_CONDITIONAL = [
    {'word': 'deeply',
     'pattern': R(r'\bdeeply\s+(?:integrated|committed|rooted|personal|human|flawed|resonant|transformative|interconnected|ingrained|embedded|meaningful)\b', 'i'),
     'suggestion': 'cut, or name what specifically runs deep'},
]

TIER3 = [
    'significant', 'significantly', 'innovative', 'innovation',
    'effective', 'effectively', 'dynamic', 'dynamics',
    'scalable', 'scalability', 'compelling', 'unprecedented',
    'exceptional', 'exceptionally', 'remarkable', 'remarkably',
    'sophisticated', 'instrumental',
    'world-class', 'state-of-the-art', 'best-in-class',
    'verbatim',
]

TIER3_PHRASES = [
    R(r'\bemerging\s+(?:sector|space|category|industry)\b', 'gi'),
    R(r'\bthe\s+integration\s+of\b', 'gi'),
    R(r'\bthe\s+intersection\s+of\b', 'gi'),
    R(r'\bcommunity-?driven\b', 'gi'),
    R(r'\blong-?term\s+sustainability\b', 'gi'),
    R(r'\buser\s+engagement\b', 'gi'),
    R(r'\bdecentralized\s+compute\b', 'gi'),
    R(r'\b(?:sustainable\s+)?reward\s+emissions?\b', 'gi'),
    R(r'\btokenized\s+incentive\s+structures?\b', 'gi'),
    R(r'\bdesigned\s+for\s+long-?term\b', 'gi'),
]

TIER3_LOOKUP = {}
for _w in TIER3:
    TIER3_LOOKUP[_w] = _w
    if _w.replace('-', '') != _w:
        TIER3_LOOKUP[_w.replace('-', '')] = _w

ISSUE_WEIGHTS = {
    'tier1': 5, 'tier1-clarity': 3, 'tier2': 3, 'tier3': 2, 'transition': 2, 'chatbot': 8, 'sycophantic': 8,
    'filler': 2, 'generic-conclusion': 3, 'lets-construction': 2, 'reasoning-artifact': 6,
    'significance-inflation': 4, 'vague-attribution': 5, 'hollow-intensifier': 2, 'emotional-flatline': 0,
    'lingering-attention': 3, 'novelty-inflation': 3, 'cutoff-disclaimer': 10, 'template-phrase': 3,
    'false-concession': 2, 'rhetorical-question': 2, 'confidence-calibration': 2, 'em-dash': 0, 'uniformity': 5,
    'formatting': 3, 'tier3-phrase': 3, 'tier3-phrase-cluster': 12, 'hashtag-stuff': 12, 'bullet-np-list': 10,
    'hedge-stack': 6, 'future-narrative': 12, 'real-actual-inflation': 5, 'social-cta-closer': 8,
    'performed-insight': 3, 'negation-chain': 5, 'negative-parallelism': 4, 'dev-blog-boilerplate': 3,
    'formulaic-opener': 8, 'speculative-opener': 8, 'launch-intro': 8, 'crowd-contrast': 6,
    'fake-casual-prop': 8, 'title-case-header': 4, 'parenthetical-hedge': 3, 'smart-punct-signature': 0,
    'punct-distribution': 6, 'fnword-trigram-entropy': 5, 'cross-para-burstiness': 5, 'normalization-flag': 9,
    'low-ttr': 3, 'ai-placeholder': 10, 'ai-citation-markup': 15, 'ai-utm-source': 12,
    'unnecessary-hyphenation': 0,
}


def _w(t):
    return ISSUE_WEIGHTS.get(t, 2)


TRANSITIONS = [R(s, 'gi') for s in [
    r'\bmoreover\b', r'\bfurthermore\b', r'\badditionally\b', r"\bin\s+today'?s\b", r'\bin\s+an\s+era\s+where\b',
    r"\bit'?s\s+worth\s+noting\s+that\b", r'\bnotably\b', r'\bin\s+conclusion\b', r'\bin\s+summary\b',
    r'\bto\s+summarize\b', r'\bwhen\s+it\s+comes\s+to\b', r'\bat\s+the\s+end\s+of\s+the\s+day\b',
    r'\bthat\s+(?:being\s+)?said\b']]

CHATBOT_ARTIFACTS = [R(s, 'gi') for s in [
    r'\bi\s+hope\s+this\s+helps\b', r'\bcertainly!\b', r'\babsolutely!\b', r'\bgreat\s+question!\b',
    r'\bexcellent\s+point!\b', r'\bfeel\s+free\s+to\s+reach\s+out\b',
    r'\blet\s+me\s+know\s+if\s+you\s+need\s+anything\b', r'\bin\s+this\s+article,?\s+we\s+will\s+explore\b',
    r"\blet'?s\s+dive\s+in!?\b"]]

SYCOPHANTIC = [R(s, 'gi') for s in [
    r"\byou'?re\s+absolutely\s+right\b", r"\bthat'?s\s+a\s+really\s+insightful\b",
    r"\bthat'?s\s+a\s+great\s+question\b", r'\bexcellent\s+question\b']]

FILLERS = [R(s, 'gi') for s in [
    r'\bit\s+is\s+important\s+to\s+note\s+that\b', r'\bin\s+terms\s+of\b', r'\bthe\s+reality\s+is\s+that\b',
    r"\bit'?s\s+important\s+to\s+note\s+that\b"]]

GENERIC_CONCLUSIONS = [R(s, 'gi') for s in [
    r'\bthe\s+future\s+looks\s+bright\b', r'\bonly\s+time\s+will\s+tell\b', r'\bone\s+thing\s+is\s+certain\b',
    r'\bas\s+we\s+move\s+forward\b']]

LETS_PATTERNS = [R(s, 'gi') for s in [
    r"\blet'?s\s+explore\b", r"\blet'?s\s+take\s+a\s+look\b", r"\blet'?s\s+break\s+this\s+down\b",
    r"\blet'?s\s+examine\b", r"\blet'?s\s+(?:consider|discuss|delve|unpack|walk\s+through)\b"]]

REASONING_ARTIFACTS = [R(s, 'gi') for s in [
    r'\blet\s+me\s+think\s+step\s+by\s+step\b', r'\bbreaking\s+this\s+down\b',
    r'\bto\s+approach\s+this\s+systematically\b', r"\bhere'?s\s+my\s+thought\s+process\b",
    r"\bfirst,?\s+let'?s\s+consider\b", r'\bworking\s+through\s+this\s+logically\b']]

SIGNIFICANCE_INFLATION = [R(s, 'gi') for s in [
    r'\bmarking\s+a\s+(?:pivotal|significant|important)\s+moment\b', r'\ba\s+watershed\s+moment\s+for\b',
    r'\b(?:moment|milestone|chapter|era|turning\s+point|watershed|inflection\s+point|leap|role|new\s+phase)\s+in\s+the\s+evolution\s+of\b',
    r'\ba\s+(?:pivotal|defining)\s+moment\s+in\b']]

VAGUE_ATTRIBUTIONS = [R(s, 'gi') for s in [
    r'\bexperts\s+(?:believe|say|suggest|agree)\b', r'\bstudies\s+(?:show|suggest|indicate)\b',
    r'\bresearch\s+(?:shows|suggests|indicates)\b', r'\bindustry\s+leaders\s+(?:agree|believe|say)\b']]

HOLLOW_INTENSIFIERS = [R(s, 'gi') for s in [
    r'\bgenuine(?:ly)?\b', r'\btruly\b', r'\bquite\s+frankly\b', r'\bto\s+be\s+honest\b',
    r"\blet'?s\s+be\s+clear\b"]]

EMOTIONAL_FLATLINE = [R(s, 'gi') for s in [
    r'\bwhat\s+surprised\s+me\s+most\b', r'\bi\s+was\s+fascinated\s+to\b', r'\bwhat\s+struck\s+me\s+was\b',
    r'\bi\s+was\s+excited\s+to\s+learn\b', r'\bthe\s+most\s+interesting\s+(?:part|thing|aspect|piece)\b']] + [
    R(r'^[ \t]*interesting\s+(?:part|thing|aspect|piece)(?:\s+of\s+(?:the\s+)?\w+)?\s*:', 'gim')]

LINGERING_ATTENTION = [R(s, 'gi') for s in [
    r'\b(?:the|that|this)\s+(?:one\s+)?(?:line|quote|bit|part|idea|point|framing|comment|thing)\s+(?:that\s+)?i\s+keep\s+(?:coming\s+back\s+to|thinking\s+about)\b',
    r"\bi\s+can'?t\s+stop\s+thinking\s+about\b", r'\bstill\s+thinking\s+about\s+(?:this|that)\s+one\b',
    r'\b(?:been|be)\s+rattling\s+around\s+(?:in\s+)?my\s+(?:head|brain)\b',
    r"\bi'?ve\s+been\s+chewing\s+on\s+(?:this|that)\b"]]

NOVELTY_INFLATION = [R(s, 'gi') for s in [
    r"\bthe\s+failure\s+mode\s+nobody'?s?\s+naming\b", r'\ba\s+problem\s+nobody\s+talks\s+about\b',
    r"\bthe\s+insight\s+everyone'?s?\s+missing\b", r'\bwhat\s+nobody\s+tells\s+you\b']]

CUTOFF_DISCLAIMERS = [R(s, 'gi') for s in [
    r'\bas\s+of\s+my\s+last\s+update\b', r'\bas\s+of\s+my\s+(?:knowledge\s+)?(?:cut-?off|last\s+training)\b',
    r"\bi\s+don'?t\s+have\s+access\s+to\s+real-?time\s+(?:data|information)\b",
    r'\bbased\s+on\s+available\s+information\b',
    r'\bas\s+an?\s+(?:ai|artificial\s+intelligence|large\s+language|ai\s+language)\s+(?:language\s+)?model\b',
    r"\bi\s+(?:am|'m)\s+an?\s+(?:ai|artificial\s+intelligence|large\s+language)\s+(?:assistant|model)?\b",
    r'\bi\s+cannot\s+(?:provide|give|offer)\s+(?:legal|medical|financial|professional)\s+advice\b',
    r'\bmy\s+training\s+data\s+(?:only\s+)?(?:goes\s+up\s+to|extends\s+to|ends\s+(?:in|at))\b']]

AI_PLACEHOLDERS = [
    R(r'\[(?:Your|Insert|Add|Enter|Describe|Specify|Choose|Pick)[^\]\n]{1,80}\]', 'gi'),
    R(r'\[(?:Recipient|Sender|Topic|Subject|Salutation|Closing|Position|Department|Project Name|Company Name|Date)(?:\s+[^\]\n]{0,60})?\]', 'gi'),
    R(r'\[(?:INSERT|FILL\s+IN|ADD|TODO|TBD|PLACEHOLDER)[^\]\n]{0,80}\]', 'g'),
    R(r'\b(?:19|20)\d{2}-XX-XX\b', 'g'),
    R(r'\bXX\/XX\/(?:19|20)\d{2}\b', 'g'),
    R(r'<!--\s*(?:add|fill\s+in|insert|todo|placeholder)[^>]{0,120}-->', 'gi'),
]

AI_CITATION_MARKUP = [
    R(r'\bcite(?:turn|news|search|navigation)\d+(?:search|turn|news|navigation)\d+', 'gi'),
    R(r'contentReference\s*\[oaicite:[^\]]+\]\s*\{[^}]*\}', 'gi'),
    R(r'\boai_citation\b', 'gi'),
    R(r'\[attached_file:\d+\]', 'gi'),
    R(r'\bgrok_card\b', 'gi'),
]

AI_UTM_SOURCE = [
    R(r'[?&]utm_source=(?:chatgpt|openai|copilot|claude|grok|gemini|perplexity)(?:\.com|\.ai)?\b', 'gi'),
    R(r'[?&]referrer=(?:chatgpt|copilot|grok|claude|gemini|perplexity)\.(?:com|ai)\b', 'gi'),
]

TEMPLATE_PHRASES = [
    R(r'\ban?\s+(?:meaningful|significant|major|crucial|important|big|huge|bold|giant|monumental|pivotal|critical|key|vital|massive|tremendous|substantial|decisive|landmark|historic|exciting|transformative)\s+step\s+(?:towards?|forward)\b', 'gi'),
    R(r"\bwhether\s+you'?re\s+\w+\s+or\s+\w+", 'gi'),
    R(r'\bi\s+recently\s+had\s+the\s+pleasure\s+of\b', 'gi'),
]

FALSE_CONCESSION_SUBJECT = r'[^,;:.!?\n]{1,60}?'
FALSE_CONCESSION_GAP = r'[^,;:.!?\n]{0,80}?[,;:]\s*[^,;:.!?\n]{0,80}?'
FALSE_CONCESSION_VAGUE_CLOSE = (r'(?:remains?\s+a\s+challenge'
                                r'|(?:is|are)\s+still\s+an?\s+open\s+questions?'
                                r'|there\s+(?:is|are)\s+still\s+work\s+to\s+do'
                                r'|remains?\s+unanswered)\b')
FALSE_CONCESSION = [
    R(r'\bwhile\s+' + FALSE_CONCESSION_SUBJECT + r'\s+is\s+impressive\b' + FALSE_CONCESSION_GAP + FALSE_CONCESSION_VAGUE_CLOSE, 'gi'),
    R(r'\balthough\s+' + FALSE_CONCESSION_SUBJECT + r'\s+has\s+made\s+strides\b' + FALSE_CONCESSION_GAP + FALSE_CONCESSION_VAGUE_CLOSE, 'gi'),
]

RHETORICAL_QUESTIONS = [R(s, 'gi') for s in [
    r'\bbut\s+what\s+does\s+this\s+mean\s+for\b', r'\bso\s+why\s+should\s+you\s+care\b', r"\bwhat'?s\s+next\?\s*"]]

HEDGE_STACK = [
    R(r'\b(?:could|may|might)\s+(?:(?!not\b|never\b|hardly\b|scarcely\b|barely\b)\w+\s+)?(?:potentially|eventually|ultimately|possibly|conceivably)\b', 'gi'),
    R(r'\b(?:potentially|eventually|ultimately)\s+(?:could|may|might)\b', 'gi'),
]

FUTURE_NARRATIVE = [
    R(r'\b(?:may|could|will|is\s+(?:poised|set)\s+to)\s+become\s+(?:one\s+of\s+)?(?:the\s+)?(?:most\s+)?\w+\s+(?:narratives?|stories|developments?|trends?|movements?|chapters?|themes?|forces?)\b', 'gi'),
    R(r'\bone\s+of\s+the\s+most\s+important\s+(?:narratives?|stories|trends?|themes?)\s+of\s+the\s+(?:next|coming)\s+\w+\b', 'gi'),
]

REAL_ACTUAL_INFLATION = [
    R(r'\b(?:real|actual|genuine|true)\s+(?:on-?chain\s+)?(?:tokenomics|economics|utility|adoption|sustainability|impact|revenue|fundamentals|demand|value|innovation|traction)\b', 'gi'),
]

FORMULAIC_OPENERS = [
    R(r'\bin\s+the\s+(?:rapidly\s+|ever-?\s*)?(?:evolving|changing|expanding|growing|shifting)\s+(?:world|landscape|realm|space|field|domain|era)\s+of\b', 'gi'),
    R(r'\bin\s+(?:an?|the)\s+(?:digital\s+)?age\s+(?:where|of)\b', 'gi'),
    R(r'\bas\s+(?:we|the\s+world|society|industries?)\s+(?:continue|move|navigate|enter)\s+(?:to\s+)?(?:evolve|forward|into|through)\b', 'gi'),
    R(r'\bhas\s+emerged\s+as\s+(?:a|the|one\s+of)\s+(?:leading|key|major|critical|essential|fundamental|pivotal|prominent|dominant|important)\s+\w+', 'gi'),
    R(r'\bhas\s+become\s+increasingly\s+(?:important|critical|popular|relevant|prominent|essential)\b', 'gi'),
]

SPECULATIVE_OPENERS = [
    R(r'\b(?:imagine|picture|envision)(?:\s*,[^,\n]{1,30},)?\s+a\s+(?:world|future|reality)\s+(?:where|in\s+which)\b', 'gi'),
]

LAUNCH_INTROS = [
    R(r"(?<=^|[.!?]\s|\n)Meet\s+[A-Z][\w'-]{1,29}\s*,\s*(?:your\s+new\s+(?:favorite|go-to)\b|the\s+new\s+(?:home\s+of\b|way\s+to\b|standard\s+(?:in|for)\b|(?:standard|way|home)(?=\s*(?:[.!?,;:–—]|$))))", 'g'),
    R(r"(?<=^|[.!?]\s|\n)[Tt]hink\s+[A-Z][\w'-]{1,29}\s+meets\s+[A-Z][\w'-]{1,29}\b", 'g'),
]

CROWD_CONTRAST = [
    R(r'\bwhile\s+(?:everyone\s+else|the\s+(?:industry|market|competition)|others)\s+(?:was|were|is|are)\s+still\s+(?:busy\s+)?(?:(?:debat|deliberat|hesitat|theoriz|philosophiz|pontificat|speculat|argu)ing|(?:dither|bicker)ing)\b', 'gi'),
    R(r'\bwhile\s+(?:everyone\s+else|the\s+(?:industry|market|competition)|others)\s+(?:was\s+|were\s+)?(?:busy\s+)?(?:writing|wrote)\s+think-?\s?pieces\b', 'gi'),
    R(r'\bwhile\s+(?:everyone\s+else|the\s+(?:industry|market|competition)|others)\s+(?:was\s+|were\s+|is\s+|are\s+)?(?:still\s+)?play(?:ed|ing|s)?\s+catch[-\s]?up\b', 'gi'),
]

FAKE_CASUAL_PROPS = [
    R(r"\*\s?(?:checks\s+notes|chef['’]s\s+kiss|mic\s+drop|takes\s+a\s+deep\s+breath|sips\s+(?:coffee|tea)|nervous\s+laughter)\s?\*", 'gi'),
    R(r'\(\s?(?:yes|no)\s?,\s?(?:really|seriously)\s?\)', 'gi'),
]

PERFORMED_INSIGHT = [
    R(r"""\bsit(?:s|ting)?\s+with\s+(?:that|this)(?=\s*(?:[.!?,;:)–—’"']|for\s+a\s+(?:moment|minute|second|beat)\b|$))(?:\s+for\s+a\s+(?:moment|minute|second|beat))?""", 'gi'),
    R(r'\bsit(?:s|ting)?\s+with\s+(?:the|your)\s+(?:discomfort|tension|uncertainty|ambiguity|grief|unease)\b', 'gi'),
    R(r"\b(?:that|this|it|which)(?:['’]s|\s+(?:is|was))\s+not\s+nothing\b", 'gi'),
    R(r'\byou\s+already\s+know\s+the\s+answer\b', 'gi'),
    R(r"\b(?:do\s+not|don['’]t)\s+(?:have\s+to\s+)?take\s+my\s+word\s+for\s+it\b", 'gi'),
    R(r'(?<=^|[.!?]\s|\n)Turns\s+out\b', 'g'),
    R(r"(?:['’]s|\b(?:is|was|are|were))\s+the\s+(?:whole|entire)\s+(?:point|game|ballgame|trick|pitch|idea|play|business\s+model|value\s+proposition)\b", 'gi'),
    R(r"\b(?:that|this)(?:['’]s|\s+(?:is|was))\s+the\s+part\s+(?:that|I|you|we|nobody|no\s+one|most\s+people)\b", 'gi'),
    R(r"\bthe\s+only\s+[\w'’-]+\s+that\s+(?:matters|counts)\b", 'gi'),
    R(r"\b(?:that|this)(?:['’]s|\s+(?:is|was))\s+why\s+[^.!?\n]{0,60}\s+mattered\b", 'gi'),
]

STAGED_DISCOVERY = [
    R(r'\b(?:turned|turns|turning)\s+out\s+to\s+be\s+the\s+(?:least|most)\s+(?:interesting|important|surprising|revealing|valuable|useful)\s+(?:part|thing|piece|bit)\b', 'gi'),
    R(r'\bthe\s+real\s+story\s+(?:here\s+)?(?:is|was)\b(?=\s+(?:the|that|how|why|what)\b)', 'gi'),
]

NO_ITEM_STOP = r'(?!matter\b|one\b|doubt\b|longer\b|way\b|less\b|more\b|such\b|other\b|means\b)'
NO_ITEM_SECOND_STOP = r'(?!(?:in|on|at|of|to|for|with|from|by|is|are|was|were|be|been|being|will|would|can|could|should|shall|may|might|must|have|has|had|do|does|did)\b)'
NEGATION_CHAIN = [
    R(r"(?<=^|[.!?]\s|\n|[:–—]\s)No\s+" + NO_ITEM_STOP + "[a-z'’-]+(?:\\s+" + NO_ITEM_SECOND_STOP + "[a-z'’-]+)?"
      + r"(?:\s*,\s*(?:and\s+|or\s+|just\s+)?no\s+" + NO_ITEM_STOP + "[a-z'’-]+(?:\\s+" + NO_ITEM_SECOND_STOP + "[a-z'’-]+)?){2,}", 'gm'),
    R(r"\b(?:did\s+not|didn['’]t)\s+[a-z]+[^,.;!?\n]{0,20},\s*(?:did\s+not|didn['’]t)\s+[a-z]+", 'gi'),
    R(r"""\b(?:do\s+not|don['’]t)\s+(?:just\s+)?(\w+)\s+it\b[^.!?\n]{0,60}[.!?;:,][\s'"”’]*(?:just\s+)?\1\s+it\b""", 'gi'),
]

NP_NEG = r"(?:\b(?:is|are|was|were)(?:n['’]t|\s+not)|\b(?:it|this|that|they|he|she|we|you)['’](?:s|re)\s+not)"
NP_MINIMIZER = r'(?:just|merely|simply)'
NP_BODY = r'[^,;:.!?\n—–]{1,80}?'
NP_JOIN = r'(?:\s*[,;:]|\s*[—–]|\s+--)\s*'
NP_RESTATE = r"(?:it|this|that|they)(?:['’](?:s|re)|\s+(?:is|are|was|were))\b"
NEGATIVE_PARALLELISM_REVEAL = [R(NP_NEG + r'\s+' + NP_MINIMIZER + r'\s+' + NP_BODY + NP_JOIN + NP_RESTATE, 'gi')]
NEGATIVE_PARALLELISM_CONTRAST = [
    R(NP_NEG + r'\s+(?!' + NP_MINIMIZER + r'\b)' + NP_BODY + NP_JOIN + NP_RESTATE, 'gi'),
    R(NP_NEG + r'\s+' + NP_MINIMIZER + r'\s+' + NP_BODY + r'[.!]\s+' + NP_RESTATE, 'gi'),
]
NP_WINDOW_SENTENCES = 2
NP_PARAGRAPH_BREAK = R(r'(?:\r\n|\r(?!\n)|\n)[ \t]*(?:\r\n|\r|\n)')


def negative_parallelism_issues(text, reveals, contrasts):
    distinct_reveals = deduplicate_issues(reveals)
    distinct_contrasts = deduplicate_issues(contrasts)
    if len(distinct_contrasts) == 0 or len(distinct_reveals) + len(distinct_contrasts) < 2:
        return distinct_reveals
    frames = distinct_reveals + distinct_contrasts
    starts = [s for s, _ in split_sentence_spans(text)]

    def sentence_of(index):
        lo, hi = 0, len(starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) >> 1
            if starts[mid] <= index:
                lo = mid
            else:
                hi = mid - 1
        return lo

    sentences = [sentence_of(f['index']) for f in frames]

    def same_paragraph(a, b):
        return not NP_PARAGRAPH_BREAK.test(text[min(a, b):max(a, b)])

    paired = []
    for c, contrast in enumerate(distinct_contrasts):
        i = len(distinct_reveals) + c
        if any(j != i and frames[j]['index'] != contrast['index'] and abs(other - sentences[i]) <= NP_WINDOW_SENTENCES
               and same_paragraph(frames[j]['index'], contrast['index']) for j, other in enumerate(sentences)):
            paired.append(contrast)
    return sorted(distinct_reveals + paired, key=lambda x: x['index'])


DEV_BLOG_BOILERPLATE = [
    R(r'\bit\s+just\s+works\b(?!\s+out\b(?![-\s]+of[-\s]+the[-\s]+box\b))', 'gi'),
    R(r'\bzero[-\s]config(?:uration)?\b', 'gi'),
    R(r'\bsane\s+defaults\b', 'gi'),
    R(r'\b(?:hold|fit|fits|holds)\s+in\s+your\s+head\b', 'gi'),
]

FUNCTION_WORD = R(r'\b(?:And|Or|Of|The|In|For|To|A|An)\b')
MD_HEADING_PREFIX = R(r'^#{1,6}[ \t]+')
_FENCE_LINE_M = R(r'^[ \t]{0,3}(`{3,}|~{3,})([^\n]*)$', 'gm')
_FENCE_LINE = R(r'^[ \t]{0,3}(`{3,}|~{3,})([^\n]*)$')
_FENCE_TAIL = R(r'^[ \t]*\r?$')


def fence_ranges(text):
    ranges = []
    open_ = None
    for m in _FENCE_LINE_M.all(text):
        marker = m.group(1)
        if open_ is None:
            open_ = (marker[0], len(marker), m.start())
        elif marker[0] == open_[0] and len(marker) >= open_[1] and _FENCE_TAIL.test(m.group(2)):
            ranges.append((open_[2], m.end()))
            open_ = None
    if open_ is not None:
        ranges.append((open_[2], len(text)))
    return ranges


def in_fence_range(ranges, index):
    return isinstance(index, int) and any(a <= index < b for a, b in ranges)


def blank_range(chars, start, end):
    for i in range(max(start, 0), min(end, len(chars))):
        if chars[i] != '\n':
            chars[i] = ' '


def inline_code_ranges(text):
    runs = []
    i = 0
    n = len(text)
    while i < n:
        if text[i] == '\n':
            runs.append(None)
            i += 1
            continue
        if text[i] != '`':
            i += 1
            continue
        start = i
        while i < n and text[i] == '`':
            i += 1
        runs.append((start, i, i - start))
    ranges = []
    line_start = 0
    while line_start < len(runs):
        try:
            line_end = runs.index(None, line_start)
        except ValueError:
            line_end = len(runs)
        next_by_length = {}
        next_same = [None] * (line_end - line_start)
        for k in range(line_end - 1, line_start - 1, -1):
            next_same[k - line_start] = next_by_length.get(runs[k][2])
            next_by_length[runs[k][2]] = k
        k = line_start
        while k < line_end:
            close = next_same[k - line_start]
            if close is None:
                k += 1
                continue
            ranges.append((runs[k][0], runs[close][1]))
            k = close + 1
        line_start = line_end + 1
    return ranges


def mask_code(text):
    chars = list(text)
    for a, b in fence_ranges(text):
        blank_range(chars, a, b)
    without = ''.join(chars)
    if '`' in without:
        for a, b in inline_code_ranges(without):
            blank_range(chars, a, b)
    return ''.join(chars)


_LINE_RE = R(r'[^\r\n]*(?:\r\n|\n|\r|$)', 'g')
_EOL_RE = R(r'(?:\r\n|\n|\r)$')
_FM_DASH = R(r'^---[ \t]*$')
_YAML_KEY = R(r"""^[ \t]*(?:[A-Za-z0-9_.-]+|"[^"\r\n]+"|'[^'\r\n]+')[ \t]*:""")
_YAML_COMMENT = R(r'^[ \t]*#')


def _lines_with_offsets(text):
    out = []
    for m in _LINE_RE.all(text):
        if not m.group(0):
            break
        body = _EOL_RE.replace(m.group(0), lambda _m: '')
        out.append((body, m.start(), m.start() + len(body)))
    return out


def initial_frontmatter_range(text):
    lines = _lines_with_offsets(text)
    if len(lines) < 3 or not _FM_DASH.test(lines[0][0][1:] if lines[0][0].startswith('﻿') else lines[0][0]):
        return None
    closing = -1
    for i in range(1, len(lines)):
        if _FM_DASH.test(lines[i][0]):
            closing = i
            break
    if closing == -1:
        return None
    first = next((ln for ln in lines[1:closing] if js_trim(ln[0]) and not _YAML_COMMENT.test(ln[0])), None)
    if first is None or not _YAML_KEY.test(first[0]):
        return None
    return (0, lines[closing][2])


_INDENTED_S = R(r'^(?: {4}|\t)\S')
_INDENTED = R(r'^(?: {4}|\t)')
_LIST_ITEM = R(r'^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)')
_NON_SPACE_START = R(r'^\S')
_INLINE_SPAN = R(r'(`+)(?:(?!\1)[^\n])+\1', 'g')


def mask_html_comments_outside_code(chars):
    source = ''.join(chars)
    lines = source.split('\n')
    offset = 0
    open_fence = None
    in_indented = False
    previous_blank = True
    list_context = False
    masked = 0
    closings = []
    k = source.find('-->')
    while k != -1:
        closings.append(k)
        k = source.find('-->', k + 1)
    closing_cursor = 0

    def backtick_runs(line):
        runs = []
        i = 0
        while i < len(line):
            if line[i] != '`':
                i += 1
                continue
            start = i
            while i < len(line) and line[i] == '`':
                i += 1
            runs.append([start, i, i - start, -1])
        nbl = {}
        for i in range(len(runs) - 1, -1, -1):
            runs[i][3] = nbl.get(runs[i][2], -1)
            nbl[runs[i][2]] = i
        return runs

    for original in lines:
        line_end = offset + len(original)
        visible = ''.join(chars[offset:line_end])
        fm = _FENCE_LINE.exec(visible)
        fenced = False
        if open_fence is not None:
            fenced = True
            if fm and fm.group(1)[0] == open_fence[0] and len(fm.group(1)) >= open_fence[1] and _FENCE_TAIL.test(fm.group(2)):
                open_fence = None
        elif fm:
            fenced = True
            open_fence = (fm.group(1)[0], len(fm.group(1)))
        indented = _INDENTED_S.test(visible)
        indented_code = not fenced and indented and (in_indented or (previous_blank and not list_context))
        if not fenced and not indented_code:
            runs = backtick_runs(visible)
            run_index = 0
            cursor = 0
            while cursor < len(visible):
                while run_index < len(runs) and runs[run_index][0] < cursor:
                    run_index += 1
                ci = visible.find('<!--', cursor)
                run = runs[run_index] if run_index < len(runs) else None
                if run and (ci == -1 or run[0] < ci):
                    if run[3] != -1:
                        cursor = runs[run[3]][1]
                        run_index = run[3] + 1
                    else:
                        cursor = run[1]
                        run_index += 1
                    continue
                if ci == -1:
                    break
                opening = offset + ci
                while closing_cursor < len(closings) and closings[closing_cursor] < opening + 2:
                    closing_cursor += 1
                closing = closings[closing_cursor] if closing_cursor < len(closings) else -1
                end = len(source) if closing == -1 else closing + 3
                if closing != -1:
                    closing_cursor += 1
                blank_range(chars, opening, end)
                masked += 1
                cursor = min(len(visible), end - offset)
        visible = ''.join(chars[offset:line_end])
        layout = list(visible)
        if fenced:
            blank_range(layout, 0, len(layout))
        else:
            for im in _INLINE_SPAN.all(visible):
                blank_range(layout, im.start(), im.end())
        layout_line = ''.join(layout)
        blank = js_trim(layout_line) == ''
        if indented_code:
            in_indented = True
        elif not blank:
            in_indented = False
        if not blank and not indented_code and not fenced:
            if _LIST_ITEM.test(layout_line):
                list_context = True
            elif _NON_SPACE_START.test(layout_line):
                list_context = False
        previous_blank = blank
        offset = line_end + 1
    return masked


def mask_rendered_markdown(text):
    chars = list(text)
    mf = 0
    fm = initial_frontmatter_range(text)
    if fm:
        blank_range(chars, fm[0], fm[1])
        mf = 1
    mh = mask_html_comments_outside_code(chars)
    return {'text': ''.join(chars), 'maskedFrontmatter': mf, 'maskedHtmlComments': mh}


IGNORE_MARKER_LINE_RE = R(r'^ {0,3}<!--[ \t]*avoid-ai-writing:ignore-(start|end)[ \t]*-->[ \t]*$', 'i')
MARKER_FENCE_RE = R(r'^ {0,3}(`{3,}|~{3,})(.*)$')
HTML_CODE_OPEN_RE = R(r'<(pre|code|script|style)\b[^>]*>', 'iy')
HTML_CODE_CLOSE_RE = {'pre': R(r'<\/pre', 'gi'), 'code': R(r'<\/code', 'gi'), 'script': R(r'<\/script', 'gi'),
                      'style': R(r'<\/style', 'gi')}
_IGNORE_ANY = R(r'avoid-ai-writing:ignore-', 'i')


def find_ignore_markers(text):
    n = len(text)
    markers = []

    def line_end_at(frm):
        i = frm
        while i < n and text[i] != '\n' and text[i] != '\r':
            i += 1
        return i

    def next_line_at(end):
        return end + 2 if end < n and text[end] == '\r' and end + 1 < n and text[end + 1] == '\n' else end + 1

    def is_line_start(i):
        return i == 0 or text[i - 1] == '\n' or (text[i - 1] == '\r' and (i >= n or text[i] != '\n'))

    def backtick_runs(frm, to):
        lst = []
        i = frm
        while i < to:
            if text[i] != '`':
                i += 1
                continue
            start = i
            while i < to and text[i] == '`':
                i += 1
            lst.append([start, i, i - start, -1])
        nbl = {}
        for i in range(len(lst) - 1, -1, -1):
            nxt = nbl.get(lst[i][2])
            if nxt:
                lst[i][3] = nxt[1]
            nbl[lst[i][2]] = lst[i]
        return {r[0]: r for r in lst}

    pos = 0
    fm = initial_frontmatter_range(text)
    if fm:
        pos = fm[1]
    line_end = -1
    runs = None
    prev_blank = True
    in_indented = False
    list_context = False
    while pos < n:
        if pos > line_end:
            line_end = line_end_at(pos)
            runs = None
            if is_line_start(pos):
                line = text[pos:line_end]
                blank = js_trim(line) == ''
                fence = MARKER_FENCE_RE.exec(line)
                if fence and not (fence.group(1)[0] == '`' and '`' in fence.group(2)):
                    close = n
                    scan = next_line_at(line_end)
                    while scan < n:
                        end = line_end_at(scan)
                        closing = MARKER_FENCE_RE.exec(text[scan:end])
                        if (closing and closing.group(1)[0] == fence.group(1)[0]
                                and len(closing.group(1)) >= len(fence.group(1)) and js_trim(closing.group(2)) == ''):
                            close = end
                            break
                        scan = next_line_at(end)
                    pos = close
                    prev_blank = False
                    in_indented = False
                    continue
                indented = not blank and _INDENTED.test(line)
                if indented and (in_indented or (prev_blank and not list_context)):
                    in_indented = True
                    prev_blank = False
                    pos = line_end
                    continue
                if not blank:
                    in_indented = False
                    if _LIST_ITEM.test(line):
                        list_context = True
                    elif _NON_SPACE_START.test(line):
                        list_context = False
                prev_blank = blank
                marker = IGNORE_MARKER_LINE_RE.exec(line)
                if marker:
                    markers.append((marker.group(1).lower(), pos, line_end))
                    pos = line_end
                    continue
        ch = text[pos]
        if ch == '<':
            if text.startswith('<!--', pos):
                close = text.find('-->', pos + 4)
                pos = n if close == -1 else close + 3
                continue
            HTML_CODE_OPEN_RE.lastIndex = pos
            op = HTML_CODE_OPEN_RE.exec(text)
            if op:
                close_re = HTML_CODE_CLOSE_RE[op.group(1).lower()]
                close_re.lastIndex = pos + len(op.group(0))
                close = close_re.exec(text)
                pos = n if close is None else close.start()
                continue
        elif ch == '`':
            if runs is None:
                runs = backtick_runs(pos, line_end)
            run = runs.get(pos)
            if run and run[3] != -1:
                pos = run[3]
                continue
            pos += run[2] if run else 1
            continue
        pos += 1
    return markers


def mask_ignore_regions(text):
    if not _IGNORE_ANY.test(text):
        return {'text': text, 'ignoredRegions': 0}
    chars = list(text)
    ignored = 0
    depth = 0
    open_at = -1
    for kind, start, end in find_ignore_markers(text):
        if kind == 'start':
            if depth == 0:
                open_at = start
            depth += 1
        elif depth > 0:
            depth -= 1
            if depth == 0:
                blank_range(chars, open_at, end)
                ignored += 1
    if depth > 0:
        blank_range(chars, open_at, len(chars))
        ignored += 1
    return {'text': ''.join(chars), 'ignoredRegions': ignored}


# (?<![\p{L}\p{N}]) on UTF-16 text: a BMP letter/digit before, or an astral one (a surrogate pair) before
_LN = _merge(_PROPS['L'] + _PROPS['N'])
_QUOTE_LB = '(?<!%s)(?<!%s)' % (_bmp_class([(a, min(b, 0xFFFF)) for a, b in _LN if a <= 0xFFFF]),
                                 _astral_alts([r for r in _LN if r[1] >= 0x10000]))
_QUOTED_SPAN_SRC = '(?<![\\p{L}\\p{N}])"(?:\\\\"[^"`\\n]{0,300}\\\\"|[^"`\\n]){0,300}"(?![\\p{L}\\p{N}])|“[^“”`\\n]{0,300}”'
QUOTED_SPAN_RE = RX(_QUOTED_SPAN_SRC, 'gu', re.compile(
    _QUOTE_LB + jsre(_QUOTED_SPAN_SRC.replace('(?<![\\p{L}\\p{N}])', '', 1), 'u').pattern, re.ASCII))
_NOT_TERM = R(r'[^.!?]', 'g')


def mask_quoted_spans(text):
    masked = [0]

    def fn(m):
        span = m.group(0)
        if len(span) == 2 or cp_len(span) > 302:
            return span
        masked[0] += 1
        return span[0] + _NOT_TERM.replace(span[1:-1], lambda _m: ' ') + span[-1]

    out = QUOTED_SPAN_RE.replace(text, fn) if ('"' in text or '“' in text) else text
    return {'text': out, 'maskedQuotes': masked[0]}


BLOCKQUOTE_LINE_RE = R(r'^\s*>(?:$|[\s\p{L}>"“*_[]|[-+]\s|\d{1,9}[.)]\s)', 'u')


def mask_blockquotes(text):
    chars = list(text)
    quoted = 0
    if '>' in text:
        for body, start, end in _lines_with_offsets(text):
            if BLOCKQUOTE_LINE_RE.test(body):
                blank_range(chars, start, end)
                quoted += 1
    return {'text': ''.join(chars), 'quotedLines': quoted}


_CRLF_SPLIT = R(r'\r?\n')


def strip_blockquotes(text, source_map=None):
    if '>' not in text and '\r' not in text:
        res = {'text': text, 'quotedLines': 0}
        if source_map is not None:
            res['sourceMap'] = source_map
        return res
    raw = _CRLF_SPLIT.split(text)
    strip = set()
    blanked = 0
    for i in range(len(raw)):
        if '\r' in raw[i]:
            parts = []
            for line in raw[i].split('\r'):
                if not BLOCKQUOTE_LINE_RE.test(line):
                    parts.append(line)
                else:
                    blanked += 1
                    parts.append(' ' * len(line))
            raw[i] = '\r'.join(parts)
        elif BLOCKQUOTE_LINE_RE.test(raw[i]):
            strip.add(i)
    kept = [i for i in range(len(raw)) if i not in strip]
    result = {'text': '\n'.join(raw[i] for i in kept), 'quotedLines': len(strip) + blanked}
    if source_map is None:
        return result
    line_starts = []
    offset = 0
    for i in range(len(raw)):
        line_starts.append(offset)
        offset += len(raw[i])
        if i < len(raw) - 1:
            if offset < len(text) and text[offset] == '\r':
                offset += 1
            if offset < len(text) and text[offset] == '\n':
                offset += 1
    mapped = []
    for k, li in enumerate(kept):
        start = line_starts[li]
        mapped.extend(source_map[start:start + len(raw[li])])
        if k < len(kept) - 1:
            sep = start + len(raw[li])
            nl = sep + 1 if sep < len(text) and text[sep] == '\r' else sep
            mapped.append(source_map[nl] if nl < len(source_map) else None)
    result['sourceMap'] = mapped
    return result


def mask_top_level_indented_code(chars, list_aware=False):
    lines = ''.join(chars).split('\n')
    offset = 0
    in_block = False
    previous_blank = True
    list_context = False
    for line in lines:
        indented = _INDENTED_S.test(line)
        blank = js_trim(line) == ''
        is_code = indented and (in_block or (previous_blank and (not list_aware or not list_context)))
        if is_code:
            blank_range(chars, offset, offset + len(line))
            in_block = True
        elif not blank:
            in_block = False
        if list_aware and not blank and not is_code:
            if _LIST_ITEM.test(line):
                list_context = True
            elif _NON_SPACE_START.test(line):
                list_context = False
        previous_blank = blank
        offset += len(line) + 1


_ALL_WS = R(r'^\s*$')


def mask_yaml_frontmatter(chars):
    lines = ''.join(chars).split('\n')

    def bare(line):
        return line[:-1] if line.endswith('\r') else line

    first = bare(lines[0])
    if first.startswith('﻿'):
        first = first[1:]
    if first != '---' or len(lines) < 2 or _ALL_WS.test(bare(lines[1])):
        return
    closing = -1
    for i in range(1, len(lines)):
        if bare(lines[i]) == '---':
            closing = i
            break
    if closing == -1:
        return
    end = 0
    for i in range(closing + 1):
        end += len(lines[i])
        if i < len(lines) - 1:
            end += 1
    blank_range(chars, 0, end)


_YAML_META_KEY = R(r'^([ \t]*)(?:-[ \t]+)?[a-z_][a-z0-9_.-]*[ \t]*:(.*)$')
_LEAD_INDENT = R(r'^[ \t]*')


def mask_yaml_metadata(chars):
    lines = ''.join(chars).split('\n')
    offset = 0
    nested = None
    for line in lines:
        bare = line[:-1] if line.endswith('\r') else line
        key = _YAML_META_KEY.exec(bare)
        indentation = len(_LEAD_INDENT.exec(bare).group(0))
        should = False
        if key:
            should = True
            nested = len(key.group(1)) if js_trim(key.group(2)) == '' else None
        elif nested is not None and js_trim(bare) != '' and indentation > nested:
            should = True
        else:
            nested = None
        if should:
            blank_range(chars, offset, offset + len(line))
        offset += len(line) + 1


_TABLE_DELIM = R(r'^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$')


def mask_markdown_tables(chars):
    lines = ''.join(chars).split('\n')
    rows = set()
    for i in range(len(lines)):
        cand = js_trim(lines[i])
        if '---' not in cand or not _TABLE_DELIM.test(cand):
            continue
        if i > 0 and '|' in lines[i - 1]:
            rows.add(i - 1)
        rows.add(i)
        j = i + 1
        while j < len(lines) and '|' in lines[j]:
            rows.add(j)
            j += 1
    offset = 0
    for i in range(len(lines)):
        if i in rows:
            blank_range(chars, offset, offset + len(lines[i]))
        offset += len(lines[i]) + 1


def mask_delimited_quotes(chars, open_, close, apostrophe_aware=False):
    def is_word(i):
        return 0 <= i < len(chars) and (('a' <= chars[i] <= 'z') or ('A' <= chars[i] <= 'Z') or ('0' <= chars[i] <= '9'))

    def is_escaped(index):
        slashes = 0
        i = index - 1
        while i >= 0 and chars[i] == '\\':
            slashes += 1
            i -= 1
        return slashes % 2 == 1

    start = -1
    for i in range(len(chars)):
        if start == -1:
            if chars[i] == open_ and not is_escaped(i) and (not apostrophe_aware or not is_word(i - 1)):
                start = i
        elif chars[i] == close and not is_escaped(i) and (not apostrophe_aware or not is_word(i + 1)):
            blank_range(chars, start, i + 1)
            start = -1


_HYPH_MASKS = [R(s, f) for s, f in [
    (r'^[ \t]*>[^\n]*$', 'gm'),
    (r'\b(?:https?:\/\/|www\.)[^\s<>]+', 'gi'),
    (r'<[!?/]?[a-z][^<>\n]*>', 'gi'),
    (r'(?<![a-z0-9_-])--?[a-z0-9][a-z0-9-]{0,127}', 'gi'),
    (r'(?:[a-z]:[\\/]|\.{1,2}[\\/]|~[\\/]|[\\/])[a-z0-9_.-]{1,255}', 'gi'),
    (r'(?:[a-z]:[\\/]|(?:\.\.?[\\/])?)(?:[a-z0-9_.-]{1,64}[\\/]){1,128}[a-z0-9_.-]{1,64}', 'gi'),
    (r'\b[a-z0-9_.]{0,63}-[a-z0-9_.-]{1,64}[\\/]', 'gi'),
    (r'\b[a-z0-9_.-]{1,64}-[a-z0-9_.-]{1,64}\.[a-z0-9]{1,16}\b', 'gi'),
    (r'[.#][a-z_][a-z0-9_.-]{0,63}-[a-z0-9_.-]{1,64}\b', 'gi'),
    (r'@[a-z0-9_.-]{1,64}\/[a-z0-9_.-]{1,64}-[a-z0-9_.-]{1,64}(?:@[^\s,;)\]}]{1,32})?', 'gi'),
    (r'\b[a-z0-9_.-]{1,64}-[a-z0-9_.-]{1,64}@[~^]?v?\d[a-z0-9*_.+-]{0,31}\b', 'gi'),
    (r'\b(?:[a-z0-9_.-]{0,64}\d[a-z0-9_.-]{0,64}-[a-z0-9_.-]{1,64}|[a-z0-9_.-]{1,64}-[a-z0-9_.-]{0,64}\d[a-z0-9_.-]{0,64})\b', 'gi'),
    (r'\b[a-z_][a-z0-9_.]{0,63}(?:-[a-z0-9_.]{1,64}){1,8}(?=[ \t]*[=:])', 'gi'),
    (r'\b[a-z_][a-z0-9_.]{0,63}(?:-[a-z0-9_.]{1,64}){1,8}(?=[ \t]+(?:npm[ \t]+)?(?:package|module|class|selector|config(?:uration)?[ \t]+key|key|identifier|property|setting|token|slug|command|option)\b)', 'gi'),
    (r'\b(?:(?:file(?:name)?|directory|folder|package|module|class|selector|config(?:uration)?[ \t]+key|identifier|property|setting|token|slug|command|option)(?:[ \t]+(?:named|called|is|was))?|key[ \t]+(?:named|called|is|was))[ \t]+(?:@[a-z0-9_.-]{1,64}\/)?[a-z_][a-z0-9_.]{0,63}(?:-[a-z0-9_.]{1,64}){1,8}\b', 'gi'),
    (r'\b(?:npm|pnpm|yarn)[ \t]+(?:add|install)[ \t]+(?:@[a-z0-9_.-]{1,64}\/)?[a-z0-9_.]{1,64}(?:-[a-z0-9_.]{1,64}){1,8}', 'gi'),
]]


def mask_hyphenation_protected(text):
    chars = list(mask_code(text))
    mask_top_level_indented_code(chars)
    mask_yaml_frontmatter(chars)
    mask_yaml_metadata(chars)
    mask_markdown_tables(chars)
    mask_delimited_quotes(chars, '"', '"')
    mask_delimited_quotes(chars, '“', '”')
    mask_delimited_quotes(chars, "'", "'", True)
    mask_delimited_quotes(chars, '‘', '’', True)
    for rx in _HYPH_MASKS:
        source = ''.join(chars)
        for m in rx.all(source):
            blank_range(chars, m.start(), m.end())
    return ''.join(chars)


def _first_replace(old, new):
    return lambda match: match.replace(old, new, 1)


_LONG_TERM_I = R(r'long-term', 'i')
_OOTB_I = R(r'out-of-the-box', 'i')
UNNECESSARY_HYPHENATION = [
    {'pattern': R(r'\bresearch-impact\s+aggregat(?:or|ion)s?\b', 'g'), 'suggestion': _first_replace('research-impact', 'research impact')},
    {'pattern': R(r'\bdata-source\s+strateg(?:y|ies)\b', 'g'), 'suggestion': _first_replace('data-source', 'data source')},
    {'pattern': R(r'\bPython-package\s+usage\b', 'g'), 'suggestion': _first_replace('Python-package', 'Python package')},
    {'pattern': R(r'\bRust-crate\s+usage\b', 'g'), 'suggestion': _first_replace('Rust-crate', 'Rust crate')},
    {'pattern': R(r'\bsingle-Project\s+Manifest\b', 'g'), 'suggestion': _first_replace('single-Project', 'single Project')},
    {'pattern': R(r'\btotal-downloads\s+figures?\b', 'g'), 'suggestion': _first_replace('total-downloads', 'total downloads')},
    {'pattern': R(r'\blife-sciences-native\s+citation\s+count\b', 'g'), 'suggestion': 'citation count from a life sciences source'},
    {'pattern': R(r'\bcode-base\b', 'g'), 'suggestion': _first_replace('-', '')},
    {'pattern': R(r'\bdata-set\b', 'g'), 'suggestion': _first_replace('-', '')},
    {'pattern': R(r'\btime-frame\b', 'g'), 'suggestion': _first_replace('-', '')},
    {'pattern': R(r'\broad-map\b', 'g'), 'suggestion': _first_replace('-', '')},
    {'pattern': R(r'\bin\s+real-time(?=\s*(?:[,.!?;:]|$)|\s+(?:(?:across|as|automatically|because|but|continuously|during|dynamically|every|for|from|immediately|instantly|on|simultaneously|through|throughout|until|via|when|while|with|without)\b))', 'gi'),
     'suggestion': 'in real time'},
    {'pattern': R(r'\b(?:for|over)\s+the\s+long-term(?=\s*(?:[,.!?;:]|$)|\s+(?:across|because|but|by|during|for|from|on|through|throughout|until|via|when|while|with|without)\b)', 'gi'),
     'suggestion': lambda match: _LONG_TERM_I.replace(match, lambda _m: 'long term')},
    {'pattern': R(r'\b(?:functions?|functioned|functioning|operates?|operated|operating|runs?|ran|running|works?|worked|working)\s+out-of-the-box\b', 'gi'),
     'suggestion': lambda match: _OOTB_I.replace(match, lambda _m: 'out of the box')},
]
_HYPH_ANY = re.compile(r'(?i)code-base|data-set|time-frame|road-map|real-time|long-term|out-of-the-box|research-impact|data-source|Python-package|Rust-crate|single-Project|total-downloads|life-sciences-native')


def find_unnecessary_hyphenation(text):
    issues = []
    if not _HYPH_ANY.search(text):
        return issues   # every pattern below contains one of these words: nothing can match
    scan = mask_hyphenation_protected(text)
    for entry in UNNECESSARY_HYPHENATION:
        for m in entry['pattern'].all(scan):
            sug = entry['suggestion']
            issues.append({'type': 'unnecessary-hyphenation', 'text': m.group(0), 'severity': 'medium',
                           'suggestion': sug(m.group(0)) if callable(sug) else sug})
    return issues


HEX_COLOUR = R(r'^(?=[0-9a-f]*\d)(?:[0-9a-f]{6}|[0-9a-f]{8})$', 'i')
CPP_DIRECTIVE = R(r'^(?:include|define|undef|if|ifdef|ifndef|elif|else|endif|pragma|error|warning|line)$')
_ALL_DIGITS = R(r'^\d+$')


def is_social_tag(tag):
    return not _ALL_DIGITS.test(tag) and not HEX_COLOUR.test(tag) and not CPP_DIRECTIVE.test(tag)


TITLE_CASE_HEADER = R(r'^(?:#{1,6}[ \t]+)?([A-Z][a-z]+(?:[ \t]+(?:[A-Z][a-z]+|A|I|[A-Z]{2,}|and|or|of|the|in|for|to|a|an))+[ \t]+[A-Z][a-z]+)[ \t]*$', 'gm')

PARENTHETICAL_HEDGE = [R(s, 'gi') for s in [
    r'\(\s*(?:and\s+)?(?:increasingly|notably|importantly|crucially|interestingly|perhaps)[,]?\s+[^)]{3,60}\)',
    r'\(\s*or\s+more\s+(?:precisely|accurately|specifically)[,]?\s+[^)]{3,60}\)',
    r'\(\s*though\s+to\s+be\s+fair[,]?\s+[^)]{3,60}\)',
    r'\(\s*at\s+least\s+(?:in\s+)?(?:theory|principle|part)[,]?\s+[^)]{0,60}\)']]

CONFIDENCE_CALIBRATION = [R(s, 'gi') for s in [
    r'\binterestingly\b', r'\bsurprisingly\b', r'\bimportantly\b', r'\bsignificantly\b', r'\bcertainly\b',
    r'\bundoubtedly\b', r'\bwithout\s+a\s+doubt\b']]

# (?<=^|[,.!?:\n]\s{0,4}): the lookbehind's \s{0,4} written out as five fixed widths (same set of positions)
_CTA_LB1 = r'(?<=^|[,.!?:\n]|[,.!?:\n]\s|[,.!?:\n]\s\s|[,.!?:\n]\s\s\s|[,.!?:\n]\s\s\s\s)'
_CTA_LB2 = r'(?<=^|[.!?:\n]|[.!?:\n]\s|[.!?:\n]\s\s|[.!?:\n]\s\s\s|[.!?:\n]\s\s\s\s)'
SOCIAL_CTA_CLOSER = [
    R(r'\bthis\s+one[\'’]?s?\s+(?:is\s+)?(?:well\s+|totally\s+|absolutely\s+|definitely\s+|really\s+|truly\s+|easily\s+|more\s+than\s+)?worth\s+(?:your\s+time|the\s+read|a\s+read|every\s+(?:minute|second)|reading|watching|a\s+listen|a\s+watch|a\s+look|it)\b', 'gi'),
    R(r'\bthis\s+one[\'’]?s?\s+(?:is\s+)?a\s+must[-\s]?(?:read|watch|listen|see)\b', 'gi'),
    R(r'\b(?:highly|strongly|can[\'’]?t|cannot)\s+recommend\w*\s+(?:giving\s+)?(?:this|it)\s+(?:one\s+)?a\s+(?:read|listen|watch|look|go)\b', 'gi'),
    R(r'\bdo\s+yourself\s+a\s+favou?r\s+and\s+(?:read|watch|check\s+out)\s+(?:this|it)\b', 'gi'),
    R(r'\byou\s+(?:really\s+)?(?:won[\'’]?t|do\s*n[\'’]?t|will\s+not|do\s+not)\s+want\s+to\s+miss\s+this(?:\s+one)?(?=\s*(?:[:.!\n]|$))', 'gi'),
    R(_CTA_LB1 + r'(?:you\s+can\s+)?thank\s+me\s+later\b', 'gim'),
    R(_CTA_LB2 + r'save\s+this\s+(?:one\s+)?for\s+later\b', 'gim'),
    R(r'\bbookmark\s+this(?:\s+(?:one|post|thread))?(?=\s*(?:[:.!\n]|$))', 'gi'),
    R(r'\bdo\s*n[\'’]?t\s+sleep\s+on\s+this\b', 'gi'),
    R(r'\btrust\s+me,?\s+(?:on\s+this|you[\'’]?ll)\b', 'gi'),
]

# ═══ Helpers ═══
_TOKEN_RE = R(r"[\w'-]+", 'g')
_NONSPACE_RUN = R(r'\S+', 'g')
_PARA_SPLIT = R(r'\n\s*\n')
_SENT_SPLIT = R(r'[.!?]+')


def tokenize(text):
    return _TOKEN_RE.p.findall(text.lower())


def moving_average_ttr(tokens, size):
    counts = {}
    distinct = 0
    for i in range(size):
        t = tokens[i]
        n = counts.get(t, 0) + 1
        counts[t] = n
        if n == 1:
            distinct += 1
    total = distinct
    for i in range(size, len(tokens)):
        t = tokens[i - size]
        n = counts[t] - 1
        if n == 0:
            del counts[t]
            distinct -= 1
        else:
            counts[t] = n
        t = tokens[i]
        n = counts.get(t, 0) + 1
        counts[t] = n
        if n == 1:
            distinct += 1
        total += distinct
    return total / ((len(tokens) - size + 1) * size)


def count_words(text):
    return len(_NONSPACE_RUN.p.findall(text))


def get_paragraphs(text):
    return [p for p in _PARA_SPLIT.split(text) if len(js_trim(p)) > 0]


def get_sentences(text):
    return [s for s in _SENT_SPLIT.split(text) if len(js_trim(s)) > 5]


def match_patterns(text, patterns, category, severity):
    issues = []
    for pat in patterns:
        for m in pat.all(text):
            issues.append({'type': category, 'text': m.group(0), 'index': m.start(), 'severity': severity,
                           'suggestion': None})
    return issues


MAX_WORDS = 10000
_UNDEF = object()


def build_v2_defaults(classification, confidence):
    if classification == 'HUMAN_ONLY':
        probs = {'human': 1, 'mixed': 0, 'ai': 0}
    elif classification == 'AI_ONLY':
        probs = {'human': 0, 'mixed': 0, 'ai': 1}
    else:
        probs = {'human': 0.333, 'mixed': 0.334, 'ai': 0.333}
    return {'document_classification': classification, 'class_probabilities': probs,
            'confidence_category': confidence, 'highlight_sentence_for_ai': []}


_CJK_ANY = re.compile(_emit_set(_PROPS['CJK'], True))
_CJK_RE = R(r'[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]', 'gu')
_NONSPACE_U = R(r'\S', 'gu')
SEPARATOR_DASH_RE = R(r'^\s*(?:[-*+]|\d+[.)])\s+(?:\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]*\))(?:[ \t]*(?:\([^)\n]*\)|`[^`\n]+`))?[ \t]*—', 'gm')
_ISO_DATE = R(r'^\d{4}-\d{2}-\d{2}$')
_HEADING = R(r'^#{1,6}[ \t]+')
_SEMVER = R(r'^v?\d+\.\d+\.\d+')
_ANY_EOL_SPLIT = R(r'\r\n|\n|\r')
_CURLY = R(r'[“”‘’]')
_OXFORD = R(r'\b\w+,\s+\w+,\s+and\s+\w+', 'g')
_DOUBLE_SPACE = R(r'[^.!?]  +', 'g')
_MISSING_APOS = R(r'\b(?:dont|wont|cant|isnt|wasnt|shouldnt|wouldnt|couldnt|youre|theyre|its\s+a\s+\w+ing)\b', 'i')
_PUNCTS = R(r'[,;:—()]', 'g')
_EM_DASHES = R(r'—|(?<=\s)--(?=\s|$)|(?<=^|\s)--(?=\s)', 'gm')
_HASHTAG = R(r'(?:^|\W)#(\w[\w-]*)', 'g')
_SPACE_CHAR = R(r'\s')
_VERB_RE = R(r'\b(?:is|are|was|were|has|have|had|will|would|should|must|do|does|did|can|could|may|might|am|been|being)\b', 'i')
_FENCE_RE = R(r'^\s*(?:```|~~~)')
_BOLD = R(r'\*\*[^*]+\*\*', 'g')
FUNC_WORDS = frozenset([
    'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with',
    'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'there', 'here',
    'we', 'our', 'us', 'i', 'you', 'your', 'he', 'she', 'his', 'her', 'him', 'not', 'no', 'so',
    'if', 'then', 'than', 'when', 'where', 'which', 'who', 'what', 'how', 'why', 'because',
])


def count_version_heading_dashes(value):
    count = 0
    for raw in _ANY_EOL_SPLIT.split(value):
        end = len(raw)
        while end > 0 and raw[end - 1] in ' \t':
            end -= 1
        if not _ISO_DATE.test(raw[max(0, end - 10):end]):
            continue
        cursor = end - 10
        while cursor > 0 and raw[cursor - 1] in ' \t':
            cursor -= 1
        if cursor - 1 < 0 or raw[cursor - 1] != '—':
            continue
        cursor -= 1
        while cursor > 0 and raw[cursor - 1] in ' \t':
            cursor -= 1
        prefix = raw[:cursor]
        heading = _HEADING.exec(prefix)
        if not heading:
            continue
        version = prefix[len(heading.group(0)):]
        if version.startswith('['):
            if not version.endswith(']'):
                continue
            version = version[1:-1]
        elif version.endswith(']'):
            version = version[:-1]
        if ']' in version:
            continue
        if _SEMVER.test(version):
            count += 1
    return count


def _mean(xs):
    s = 0
    for x in xs:
        s += x
    return s / len(xs)


def _var(xs, m):
    s = 0
    for x in xs:
        s += (x - m) * (x - m)
    return s / len(xs)


def analyze_text(text, options=None, min_words=10):
    """AIDetector.analyzeText(text, options). options: {'contextMode', 'sourceMode'} (a missing key is JS undefined).
    min_words is not in the JS API: the JS declines to score under 10 words ("Too short"); lint_view_strings passes 1 so
    the pattern rules still run on button-sized copy. Everything else is unchanged by it."""
    if not isinstance(text, str):
        raise TypeError('analyzeText(text): argument must be a string')
    options = options or {}
    text = to_units(text)
    VALID_CONTEXT = ('general', 'technical', 'marketing', 'personal')
    requested = options.get('contextMode', _UNDEF)
    requested = 'general' if requested is _UNDEF else requested
    context_mode = requested if isinstance(requested, str) and requested in VALID_CONTEXT else 'general'
    context_fallback = requested if not (isinstance(requested, str) and requested == context_mode) else None
    VALID_SOURCE = ('plain', 'rendered-markdown')
    req_src = options.get('sourceMode', _UNDEF)
    req_src = 'plain' if req_src is _UNDEF else req_src
    source_mode = req_src if isinstance(req_src, str) and req_src in VALID_SOURCE else 'plain'
    source_fallback = req_src if not (isinstance(req_src, str) and req_src == source_mode) else _UNDEF

    def base_stats(**kw):
        st = dict(kw)
        st.update({'contextMode': context_mode, 'contextModeFallback': context_fallback, 'sourceMode': source_mode})
        if source_fallback is not _UNDEF:
            st['sourceModeFallback'] = source_fallback
        return st

    if not text or len(js_trim(text)) == 0:
        st = {'wordCount': 0}
        st.update(base_stats())
        st.update({'maskedFrontmatter': 0, 'maskedHtmlComments': 0, 'ignoredRegions': 0, 'quotedLines': 0,
                   'maskedQuotes': 0})
        res = build_v2_defaults('UNSCORED', 'low')
        res.update({'score': 0, 'label': 'Empty', 'issues': [], 'stats': st, 'tooShort': True})
        return res

    source_map = list(range(len(text)))
    masked_frontmatter = 0
    masked_html = 0
    ignored = mask_ignore_regions(text)
    text = ignored['text']
    ignored_regions = ignored['ignoredRegions']
    if source_mode == 'rendered-markdown':
        rendered = mask_rendered_markdown(text)
        text = rendered['text']
        masked_frontmatter = rendered['maskedFrontmatter']
        masked_html = rendered['maskedHtmlComments']
    bq = mask_blockquotes(text) if source_mode == 'rendered-markdown' else strip_blockquotes(text, source_map)
    text = bq['text']
    if 'sourceMap' in bq:
        source_map = bq['sourceMap']
    quoted_lines = bq['quotedLines']
    unquoted_text = normalize_text(text)['text']
    quotes = mask_quoted_spans(text)
    text = quotes['text']
    masked_quotes = quotes['maskedQuotes']
    norm = normalize_text(text, source_map)
    text = norm['text']
    source_map = norm['sourceMap']

    word_count = count_words(text)
    tail = {'maskedFrontmatter': masked_frontmatter, 'maskedHtmlComments': masked_html,
            'ignoredRegions': ignored_regions, 'quotedLines': quoted_lines, 'maskedQuotes': masked_quotes}
    cjk = _CJK_RE.count(text) if _CJK_ANY.search(text) else 0
    if cjk > 0 and cjk * 2 >= _NONSPACE_U.count(text):
        st = {'wordCount': word_count, 'cjkChars': cjk,
              'reason': 'unsegmented-script document: no inter-word spaces to count'}
        st.update(base_stats())
        st.update(tail)
        res = build_v2_defaults('UNSCORED', 'low')
        res.update({'score': 0, 'label': 'Unsupported script', 'issues': [], 'stats': st, 'unsupportedScript': True})
        return res
    if word_count < min_words or word_count > MAX_WORDS:
        st = {'wordCount': word_count}
        st.update(base_stats())
        st.update(tail)
        res = build_v2_defaults('UNSCORED', 'low')
        if word_count < min_words:
            res.update({'score': 0, 'label': 'Too short', 'issues': [], 'stats': st, 'tooShort': True})
        else:
            res.update({'score': 0, 'label': 'Text too long', 'issues': [], 'stats': st, 'tooLong': True})
        return res

    tokens = tokenize(text)
    paragraphs = get_paragraphs(text)
    sentences = get_sentences(text)
    issues = []
    raw_score = 0
    technical = context_mode == 'technical'

    # 1. Tier 1 words
    tier1_found = set()
    for token in tokens:
        if technical and token in TECHNICAL_EXEMPT:
            continue
        if token in TIER1 and token not in tier1_found:
            tier1_found.add(token)
            issues.append({'type': 'tier1', 'text': token, 'severity': 'high', 'suggestion': TIER1[token]})
    for phrase in TIER1_PHRASES:
        for m in phrase['pattern'].all(text):
            lower = m.group(0).lower()
            if technical and lower in TECHNICAL_EXEMPT:
                continue
            if phrase['skip'] and phrase['skip'](text, m.start()):
                continue
            if lower in tier1_found:
                continue
            tier1_found.add(lower)
            issues.append({'type': 'tier1-clarity' if phrase['clarity'] else 'tier1', 'text': m.group(0),
                           'severity': 'medium' if phrase['clarity'] else 'high', 'suggestion': phrase['replace']})

    # 2. Tier 2 clusters
    tier2_clusters = 0
    for para in paragraphs:
        found = []
        suggestions = {}
        for token in tokenize(para):
            if technical and token in TECHNICAL_EXEMPT:
                continue
            if token in TIER2 and token not in found:
                found.append(token)
                suggestions[token] = TIER2[token]
        for cond in TIER2_CONDITIONAL:
            if technical and cond['word'] in TECHNICAL_EXEMPT:
                continue
            if cond['word'] not in found and cond['pattern'].test(para):
                found.append(cond['word'])
                suggestions[cond['word']] = cond['suggestion']
        if len(found) >= 2:
            tier2_clusters += 1
            for word in found:
                issues.append({'type': 'tier2', 'text': word, 'severity': 'medium', 'suggestion': suggestions[word]})

    # 3. Tier 3 density
    tier3_counts = {}
    for token in tokens:
        c = TIER3_LOOKUP.get(token)
        if c:
            tier3_counts[c] = tier3_counts.get(c, 0) + 1
    density = max(3, math.floor(word_count * 0.03))
    tier3_flags = 0
    for word, count in tier3_counts.items():
        if count >= density:
            tier3_flags += 1
            issues.append({'type': 'tier3', 'text': '"%s" x%d' % (word, count), 'severity': 'low',
                           'suggestion': 'Overused (%d times in %d words)' % (count, word_count)})

    # 4-21. Pattern categories
    for pats, cat, sev in ((TRANSITIONS, 'transition', 'medium'), (CHATBOT_ARTIFACTS, 'chatbot', 'critical'),
                           (SYCOPHANTIC, 'sycophantic', 'critical'), (FILLERS, 'filler', 'medium'),
                           (GENERIC_CONCLUSIONS, 'generic-conclusion', 'medium'),
                           (LETS_PATTERNS, 'lets-construction', 'medium'),
                           (REASONING_ARTIFACTS, 'reasoning-artifact', 'critical'),
                           (SIGNIFICANCE_INFLATION, 'significance-inflation', 'high'),
                           (VAGUE_ATTRIBUTIONS, 'vague-attribution', 'critical'),
                           (HOLLOW_INTENSIFIERS, 'hollow-intensifier', 'medium'),
                           (EMOTIONAL_FLATLINE, 'emotional-flatline', 'low'),
                           (LINGERING_ATTENTION, 'lingering-attention', 'medium'),
                           (NOVELTY_INFLATION, 'novelty-inflation', 'medium'),
                           (CUTOFF_DISCLAIMERS, 'cutoff-disclaimer', 'critical'),
                           (AI_PLACEHOLDERS, 'ai-placeholder', 'critical'),
                           (AI_CITATION_MARKUP, 'ai-citation-markup', 'critical'),
                           (AI_UTM_SOURCE, 'ai-utm-source', 'critical'),
                           (TEMPLATE_PHRASES, 'template-phrase', 'high'),
                           (FALSE_CONCESSION, 'false-concession', 'medium'),
                           (RHETORICAL_QUESTIONS, 'rhetorical-question', 'medium'),
                           (HEDGE_STACK, 'hedge-stack', 'high'), (FUTURE_NARRATIVE, 'future-narrative', 'high'),
                           (REAL_ACTUAL_INFLATION, 'real-actual-inflation', 'medium'),
                           (SOCIAL_CTA_CLOSER, 'social-cta-closer', 'high'),
                           (PERFORMED_INSIGHT, 'performed-insight', 'medium')):
        issues.extend(match_patterns(text, pats, cat, sev))
    staged = match_patterns(text, STAGED_DISCOVERY, 'performed-insight', 'medium')
    issues.extend(staged)
    issues.extend(match_patterns(text, NEGATION_CHAIN, 'negation-chain', 'high'))
    issues.extend(negative_parallelism_issues(
        text,
        match_patterns(text, NEGATIVE_PARALLELISM_REVEAL, 'negative-parallelism', 'high'),
        match_patterns(text, NEGATIVE_PARALLELISM_CONTRAST, 'negative-parallelism', 'high')))
    issues.extend(match_patterns(text, DEV_BLOG_BOILERPLATE, 'dev-blog-boilerplate', 'medium'))
    issues.extend(find_unnecessary_hyphenation(text))
    issues.extend(match_patterns(text, FORMULAIC_OPENERS, 'formulaic-opener', 'high'))
    issues.extend(match_patterns(text, SPECULATIVE_OPENERS, 'speculative-opener', 'high'))
    issues.extend(match_patterns(text, LAUNCH_INTROS, 'launch-intro', 'high'))
    issues.extend(match_patterns(text, CROWD_CONTRAST, 'crowd-contrast', 'medium'))
    issues.extend(match_patterns(text, FAKE_CASUAL_PROPS, 'fake-casual-prop', 'high'))
    issues.extend(match_patterns(text, PARENTHETICAL_HEDGE, 'parenthetical-hedge', 'medium'))

    if not technical:
        hits = match_patterns(text, [TITLE_CASE_HEADER], 'title-case-header', 'medium')
        filtered = []
        for h in hits:
            title = MD_HEADING_PREFIX.replace(h['text'], lambda _m: '')
            toks = _WS_SPLIT.split(js_trim(title))
            if len(toks) < 4:
                continue
            if FUNCTION_WORD.test(' '.join(toks[1:])):
                filtered.append(h)
        fences = fence_ranges(text) if filtered else []
        issues.extend(h for h in filtered if not in_fence_range(fences, h['index']))

    nf = norm['flags']
    if nf['zeroWidth'] > 0 or nf['homoglyph'] >= 2:
        issues.append({'type': 'normalization-flag',
                       'text': '%d zero-width + %d homoglyph swap%s' % (nf['zeroWidth'], nf['homoglyph'], '' if nf['homoglyph'] == 1 else 's'),
                       'severity': 'critical',
                       'suggestion': 'Text contains invisible/lookalike chars typical of AI-humanizer bypass tools. Re-type from your own keyboard.'})
    if nf['roleplay'] >= 2:
        issues.append({'type': 'normalization-flag', 'text': '%d *roleplay-action* markers stripped' % nf['roleplay'],
                       'severity': 'high', 'suggestion': 'Paired *action* markers are a chat-model artifact.'})

    has_dash = '—' in text
    if source_mode == 'plain':
        has_curly = _CURLY.test(text)
        total_em = text.count('—')
        sep_em = (SEPARATOR_DASH_RE.count(text) + count_version_heading_dashes(text)) if has_dash else 0
        has_em = total_em > sep_em
        has_oxford = _OXFORD.count(text) >= 1
        double_spaces = _DOUBLE_SPACE.count(unquoted_text)
        missing_apos = _MISSING_APOS.test(text)
        clean = double_spaces == 0 and not missing_apos
        signals = sum(1 for x in (has_curly, has_em, has_oxford, clean) if x)
        if signals >= 4 and word_count >= 80:
            issues.append({'type': 'smart-punct-signature', 'text': 'curly punctuation + prose em dash + Oxford comma',
                           'severity': 'low',
                           'suggestion': 'Check destination style before changing punctuation. Preserve house-style typography; this combination is not evidence of AI authorship.'})

    if len(paragraphs) >= 4:
        dens = []
        for p in paragraphs:
            words = count_words(p)
            if words < 5:
                continue
            dens.append(_PUNCTS.count(p) / words)
        if len(dens) >= 4:
            mean = _mean(dens)
            variance = _var(dens, mean)
            cv = math.sqrt(variance) / mean if mean > 0 else 0
            if cv < 0.25 and mean >= 0.04:
                issues.append({'type': 'punct-distribution',
                               'text': 'Punctuation density uniform across paragraphs (CV=%s)' % js_tofixed(cv, 2),
                               'severity': 'medium',
                               'suggestion': 'AI text holds punctuation density steady; human writers swing between dense and sparse paragraphs.'})

    if word_count >= 150:
        arr = [t if t in FUNC_WORDS else '_' for t in tokens]
        seq = [x for i, x in enumerate(arr) if x != '_' or (i > 0 and arr[i - 1] != '_')]
        if len(seq) >= 50:
            trigrams = {}
            for i in range(len(seq) - 2):
                tg = seq[i] + '|' + seq[i + 1] + '|' + seq[i + 2]
                trigrams[tg] = trigrams.get(tg, 0) + 1
            total = len(seq) - 2
            entropy = 0
            for c in trigrams.values():
                p = c / total
                entropy -= p * math.log2(p)
            distinct = len(trigrams)
            normalized = entropy / math.log2(distinct) if distinct > 1 else 1
            if normalized < 0.82 and total >= 50:
                issues.append({'type': 'fnword-trigram-entropy',
                               'text': 'Function-word trigram entropy %s (low)' % js_tofixed(normalized, 2),
                               'severity': 'medium',
                               'suggestion': 'Grammatical structure is unusually repetitive. AI sampling collapses onto narrower templates than human writing.'})
            if distinct == 1 and total >= 50:
                issues.append({'type': 'fnword-trigram-entropy',
                               'text': 'Single function-word trigram repeated across document', 'severity': 'high',
                               'suggestion': 'Grammatical structure is fully degenerate — every clause uses the same function-word skeleton.'})

    if len(paragraphs) >= 4:
        cvs = []
        for p in paragraphs:
            sents = get_sentences(p)
            if len(sents) < 3:
                continue
            lens = [count_words(s) for s in sents]
            m = _mean(lens)
            if m == 0:
                continue
            cvs.append(math.sqrt(_var(lens, m)) / m)
        if len(cvs) >= 4:
            cv_mean = _mean(cvs)
            cv_std = math.sqrt(_var(cvs, cv_mean))
            if cv_std < 0.08 and cv_mean < 0.45:
                issues.append({'type': 'cross-para-burstiness',
                               'text': 'Sentence-rhythm uniform across paragraphs (σCV=%s)' % js_tofixed(cv_std, 2),
                               'severity': 'medium',
                               'suggestion': 'Every paragraph has the same internal rhythm. Humans vary cadence between terse and discursive paragraphs.'})

    claimed = []
    distinct_phrases = 0
    for phrase in TIER3_PHRASES:
        spans = []
        for m in phrase.all(text):
            s, e = m.start(), m.end()
            if not any(s < ce and e > cs for cs, ce in claimed):
                spans.append((s, e, m.group(0)))
        if not spans:
            continue
        claimed.extend((s, e) for s, e, _ in spans)
        distinct_phrases += 1
        if len(spans) >= 2:
            issues.append({'type': 'tier3-phrase', 'text': '"%s" x%d' % (spans[0][2].lower(), len(spans)),
                           'severity': 'medium',
                           'suggestion': 'Boilerplate phrase repeated %d× — replace at least one with specifics' % len(spans)})
    if distinct_phrases >= 3:
        issues.append({'type': 'tier3-phrase-cluster', 'text': '%d distinct boilerplate phrases' % distinct_phrases,
                       'severity': 'high',
                       'suggestion': 'Several stock crypto/web3 phrases stacked in one piece. Rewrite around one specific claim or observation.'})

    if '#' in text:
        tags = [m for m in _HASHTAG.all(mask_code(text)) if is_social_tag(m.group(1))]
        if len(tags) >= 6:
            issues.append({'type': 'hashtag-stuff', 'text': '%d hashtags' % len(tags), 'severity': 'medium',
                           'suggestion': 'Cut to 2-3 specific tags or none. Long hashtag blocks read as bot output.'})

    lines = _CRLF_SPLIT.split(text)

    def parse_bullet(line):
        cursor = 0
        n = len(line)
        while cursor < n and _SPACE_CHAR.test(line[cursor]):
            cursor += 1
        if cursor >= n or line[cursor] not in ('*', '-', '•', '+'):
            return None
        cursor += 1
        spacing = cursor
        while cursor < n and _SPACE_CHAR.test(line[cursor]):
            cursor += 1
        if cursor == spacing:
            return None
        if cursor >= n:
            return '' if cursor - spacing >= 2 else None
        return js_trim(line[cursor:])

    state = {'run': [], 'blank': 0}

    def flush():
        run = state['run']
        if len(run) >= 5:
            bare = [it for it in run if 0 < count_words(it) <= 6 and not _VERB_RE.test(it)]
            if len(bare) >= 5 and len(bare) / len(run) >= 0.75:
                issues.append({'type': 'bullet-np-list', 'text': '%d-item bullet list of bare noun phrases' % len(run),
                               'severity': 'high',
                               'suggestion': 'Convert to a prose paragraph or merge items. Long lists of bare adj+noun pairs read as AI scaffolding.'})
        state['run'] = []
        state['blank'] = 0

    in_fence = False
    for line in lines:
        if _FENCE_RE.test(line):
            flush()
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        b = parse_bullet(line)
        if b is not None:
            state['run'].append(b)
            state['blank'] = 0
        elif js_trim(line) == '':
            state['blank'] += 1
            if state['blank'] >= 2:
                flush()
        else:
            flush()
    flush()

    conf = match_patterns(text, CONFIDENCE_CALIBRATION, 'confidence-calibration', 'low')
    if len(conf) >= 3:
        issues.extend(conf)

    raw_em = _EM_DASHES.count(text) if (has_dash or '--' in text) else 0
    sep_dash = (SEPARATOR_DASH_RE.count(text) + count_version_heading_dashes(text)) if has_dash else 0
    em_count = raw_em - sep_dash
    if em_count / (word_count / 1000) > 1:
        issues.append({'type': 'em-dash', 'text': '%d em dashes in %d words' % (em_count, word_count),
                       'severity': 'medium', 'suggestion': 'Replace with commas, periods, or rewrite'})

    if len(sentences) >= 5:
        lengths = [count_words(s) for s in sentences]
        avg = _mean(lengths)
        std = math.sqrt(_var(lengths, avg))
        cv = std / avg if avg > 0 else 0
        if cv < 0.25 and avg > 10:
            issues.append({'type': 'uniformity',
                           'text': 'Sentence lengths cluster around %d words (low variation)' % js_round(avg),
                           'severity': 'medium', 'suggestion': 'Mix short punchy sentences with longer flowing ones'})

    if len(tokens) >= 200:
        diversity = moving_average_ttr(tokens, 200)
        if diversity < 0.4:
            issues.append({'type': 'low-ttr',
                           'text': 'Vocabulary diversity %s%% (distinct words per 200-token window, %d tokens)' % (js_tofixed(diversity * 100, 1), len(tokens)),
                           'severity': 'low',
                           'suggestion': 'Text reuses a narrow word set. Vary nouns and verbs deliberately, or check if the topic genuinely warrants the repetition.'})

    if len(paragraphs) >= 4:
        plens = [len(get_sentences(p)) for p in paragraphs]
        avg = _mean(plens)
        if all(abs(x - avg) <= 1 for x in plens) and avg >= 3:
            issues.append({'type': 'uniformity', 'text': 'All paragraphs are ~%d sentences' % js_round(avg),
                           'severity': 'low', 'suggestion': 'Vary paragraph length deliberately'})

    bold = _BOLD.count(text) if '**' in text else 0
    if bold > 3:
        issues.append({'type': 'formatting', 'text': '%d bold phrases' % bold, 'severity': 'medium',
                       'suggestion': 'Strip bold from most; restructure to lead with key info'})

    staged_ids = {id(i) for i in staged}
    staged_spans = [(i['index'], i['index'] + len(i['text'])) for i in staged]
    non_overlapping = [
        i for i in issues
        if (i['type'] != 'emotional-flatline' and i['type'] != 'performed-insight') or id(i) in staged_ids
        or not isinstance(i.get('index'), int)
        or not any(i['index'] >= s and i['index'] + len(i['text']) <= e for s, e in staged_spans)]
    deduped = deduplicate_issues(non_overlapping)
    for i in deduped:
        raw_score += _w(i['type'])
    length_factor = max(1, math.log2(word_count / 50))
    score = min(100, js_round(raw_score / length_factor))
    label = get_label(score)
    regions, unmapped = build_sentence_regions(text, deduped, source_mode == 'rendered-markdown')
    tier1_count = sum(1 for i in deduped if i['type'] == 'tier1')
    tier2_count = sum(1 for i in deduped if i['type'] == 'tier2')
    tier3_count = sum(1 for i in deduped if i['type'] == 'tier3')
    tier1_distinct = len({(i['text'] or '').lower() for i in deduped if i['type'] == 'tier1'})
    has_transition = any(i['type'] == 'transition' for i in deduped)
    dense = word_count >= 150 and tier1_distinct >= 5 and tier2_clusters >= 2 and has_transition
    tri = classify_trinary(score, deduped, nf, word_count, dense)
    for i in deduped:
        if isinstance(i.get('index'), int):
            i['index'] = source_map[i['index']]
    for r in regions:
        r['start'] = source_map[r['start']]
        r['end'] = source_map[r['end'] - 1] + 1
    for i in deduped:
        i['text'] = from_units(i['text'])
        i['suggestion'] = from_units(i['suggestion'])
    st = {'wordCount': word_count, 'tier1Count': tier1_count, 'tier2Count': tier2_count,
          'tier2Clusters': tier2_clusters, 'tier3Count': tier3_count, 'tier3Flags': tier3_flags,
          'patternCount': len(deduped) - tier1_count - tier2_count - tier3_count}
    st.update(base_stats())
    st.update({'maskedFrontmatter': masked_frontmatter, 'maskedHtmlComments': masked_html,
               'ignoredRegions': ignored_regions, 'normalization': nf, 'quotedLines': quoted_lines,
               'maskedQuotes': masked_quotes, 'unmappedHighlights': unmapped, 'denseAIVocab': dense,
               'tier1Distinct': tier1_distinct})
    return {'score': score, 'label': label, 'issues': deduped, 'stats': st,
            'document_classification': tri[0], 'class_probabilities': tri[1], 'confidence_category': tri[2],
            'highlight_sentence_for_ai': regions}


_TERM_RUN = R(r'[.!?]+', 'g')
_FIRST_NON_SPACE = R(r'\S', 'g')


def split_sentence_spans(text):
    spans = []
    length = len(text)
    pos = 0
    term = _TERM_RUN.p
    nonspace = _FIRST_NON_SPACE.p
    while pos < length:
        run = term.search(text, pos)
        if run is None:
            head = nonspace.search(text, pos)
            if head is not None:
                spans.append((head.start(), length))
            break
        if run.start() == pos:
            run_end = run.end()
            if term.search(text, run_end) is None:
                spans.append((run_end - 1, length))
                break
            pos = run_end
            continue
        spans.append((pos, run.end()))
        pos = run.end()
    return spans


NON_HIGHLIGHT_TYPES = frozenset([
    'punct-distribution', 'cross-para-burstiness', 'fnword-trigram-entropy', 'smart-punct-signature',
    'normalization-flag', 'uniformity', 'em-dash', 'formatting', 'tier3', 'tier3-phrase', 'tier3-phrase-cluster',
    'hashtag-stuff', 'bullet-np-list', 'unnecessary-hyphenation'])


def build_sentence_regions(text, issues, trim=False):
    sentences = []
    for s0, e0 in split_sentence_spans(text):
        raw = text[s0:e0]
        st = js_trim(raw)
        if len(st) < 4:
            continue
        s, e = s0, e0
        if trim:
            s += len(raw) - len(raw.lstrip(WS))
            e -= len(raw) - len(raw.rstrip(WS))
        sentences.append((s, e))
    if not sentences:
        return [], 0
    hits = [[0, 0] for _ in sentences]
    lower = text.lower()
    unmapped = 0
    for issue in issues:
        t = issue['text']
        if not t or len(t) > 200:
            continue
        if issue['type'] in NON_HIGHLIGHT_TYPES:
            continue
        w = _w(issue['type'])
        if w == 0:
            continue
        needle = t.lower()
        idx = 0
        matched = False
        while True:
            idx = lower.find(needle, idx)
            if idx == -1:
                break
            if issue['type'] == 'tier1-clarity' and needle == 'features' and features_is_noun(text, idx):
                idx += len(needle)
                continue
            matched = True
            for k, (s, e) in enumerate(sentences):
                if s <= idx < e:
                    hits[k][0] += 1
                    hits[k][1] += w
                    break
            idx += len(needle)
            if not needle:
                idx += 1
        if not matched:
            unmapped += 1
    regions = []
    cur = None
    for k in range(len(sentences)):
        if hits[k][0] > 0:
            if cur is None:
                cur = {'startSentence': k, 'endSentence': k, 'start': sentences[k][0], 'end': sentences[k][1],
                       'hitCount': hits[k][0], 'weight': hits[k][1]}
            else:
                cur['endSentence'] = k
                cur['end'] = sentences[k][1]
                cur['hitCount'] += hits[k][0]
                cur['weight'] += hits[k][1]
        elif cur is not None:
            if k + 1 < len(hits) and hits[k + 1][0] > 0:
                cur['endSentence'] = k
                cur['end'] = sentences[k][1]
                continue
            regions.append(finalize_region(cur))
            cur = None
    if cur is not None:
        regions.append(finalize_region(cur))
    return regions, unmapped


def finalize_region(r):
    score = min(1, r['weight'] / 20)
    return {'startSentence': r['startSentence'], 'endSentence': r['endSentence'], 'start': r['start'],
            'end': r['end'], 'hitCount': r['hitCount'], 'score': js_round(score * 100) / 100}


def classify_trinary(score, issues, nf, word_count, dense):
    has_cutoff = any(i['type'] == 'cutoff-disclaimer' for i in issues)
    has_norm = nf['zeroWidth'] >= 2 or nf['homoglyph'] >= 2
    has_reasoning = any(i['type'] == 'reasoning-artifact' for i in issues)
    has_chatbot = any(i['type'] == 'chatbot' for i in issues)
    strong = (1 if has_cutoff else 0) + (1 if has_norm else 0) + (1 if has_reasoning and has_chatbot else 0) + (1 if dense else 0)
    stylo = sum(1 for t in ('punct-distribution', 'cross-para-burstiness', 'fnword-trigram-entropy')
                if any(i['type'] == t for i in issues))
    weak = 1 if stylo >= 2 else 0
    total = strong + weak
    if score < 15 and strong == 0:
        cls = 'HUMAN_ONLY'
    elif strong >= 1 or score >= 70:
        cls = 'AI_ONLY'
    elif score >= 40 and total >= 1:
        cls = 'AI_ONLY'
    else:
        cls = 'MIXED'
    ai_soft = min(0.97, score / 100 + total * 0.06 + strong * 0.08)
    if cls == 'HUMAN_ONLY':
        p = {'human': max(0.6, 1 - ai_soft), 'mixed': min(0.35, ai_soft * 0.8), 'ai': min(0.1, ai_soft * 0.3)}
    elif cls == 'AI_ONLY':
        p = {'human': max(0.02, 1 - ai_soft - 0.05), 'mixed': 0.1, 'ai': ai_soft}
    else:
        p = {'human': max(0.15, 0.6 - ai_soft * 0.5), 'mixed': 0.5, 'ai': ai_soft * 0.7}
    raw_sum = p['human'] + p['mixed'] + p['ai']
    p['human'] = float(js_tofixed(p['human'] / raw_sum, 3))
    p['mixed'] = float(js_tofixed(p['mixed'] / raw_sum, 3))
    p['ai'] = max(0, float(js_tofixed(1 - p['human'] - p['mixed'], 3)))
    if strong >= 2 or has_cutoff or (score < 8 and word_count >= 100):
        conf = 'high'
    elif strong >= 1 or (score >= 45 and weak >= 1) or score < 20:
        conf = 'medium'
    else:
        conf = 'low'
    return cls, p, conf


def get_label(score):
    if score == 0:
        return 'Clean'
    if score <= 15:
        return 'Minimal AI signals'
    if score <= 35:
        return 'Some AI patterns'
    if score <= 60:
        return 'Moderate AI signals'
    if score <= 80:
        return 'Strong AI signals'
    return 'Heavy AI patterns'


def deduplicate_issues(issues):
    seen = set()
    out = []
    for i in issues:
        key = i['type'] + ':' + i['text'].lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(i)
    return out


SEVERITY_LABELS = {'critical': 'P0', 'high': 'P1', 'medium': 'P2', 'low': 'P3'}
TYPE_LABELS = {
    'tier1': 'AI vocabulary', 'tier1-clarity': 'Wordiness', 'tier2': 'Word cluster', 'tier3': 'Overused word',
    'transition': 'AI transition', 'chatbot': 'Chatbot artifact', 'sycophantic': 'Sycophantic tone',
    'filler': 'Filler phrase', 'generic-conclusion': 'Generic conclusion', 'lets-construction': '"Let\'s" opener',
    'reasoning-artifact': 'Reasoning artifact', 'significance-inflation': 'Significance inflation',
    'vague-attribution': 'Vague attribution', 'hollow-intensifier': 'Hollow intensifier',
    'emotional-flatline': 'Stock reaction framing', 'lingering-attention': 'Lingering-attention claim',
    'novelty-inflation': 'Novelty inflation', 'cutoff-disclaimer': 'Cutoff disclaimer',
    'template-phrase': 'Template phrase', 'false-concession': 'False concession',
    'rhetorical-question': 'Rhetorical question', 'confidence-calibration': 'Confidence stacking',
    'em-dash': 'Em dash overuse', 'uniformity': 'Rhythm uniformity', 'formatting': 'Formatting',
    'tier3-phrase': 'Boilerplate phrase', 'tier3-phrase-cluster': 'Boilerplate cluster',
    'hashtag-stuff': 'Hashtag stuffing', 'bullet-np-list': 'Bullet-NP list', 'hedge-stack': 'Hedge-stacked prediction',
    'future-narrative': 'Generic future narrative', 'real-actual-inflation': '"Real/actual" inflation',
    'social-cta-closer': 'Engagement-bait closer', 'formulaic-opener': 'Formulaic opener',
    'speculative-opener': 'Speculative scenario opener', 'launch-intro': 'Launch-copy introduction',
    'crowd-contrast': 'Dramatized crowd contrast', 'fake-casual-prop': 'Fake-casual prop',
    'title-case-header': 'Title Case header', 'parenthetical-hedge': 'Parenthetical hedge',
    'smart-punct-signature': 'Smart-punct signature', 'punct-distribution': 'Punctuation distribution',
    'fnword-trigram-entropy': 'Grammar repetition', 'cross-para-burstiness': 'Cross-paragraph rhythm',
    'normalization-flag': 'Bypass-trick chars', 'low-ttr': 'Low vocabulary diversity',
    'ai-placeholder': 'Unfilled placeholder', 'ai-citation-markup': 'Chatbot citation markup leak',
    'ai-utm-source': 'AI-tool URL parameter', 'unnecessary-hyphenation': 'Unnecessary hyphenation',
    'performed-insight': 'Performed-insight phrase', 'negation-chain': 'Negation chain',
    'negative-parallelism': 'Negative parallelism', 'dev-blog-boilerplate': 'Dev-blog boilerplate',
}


# ═══ Gate lint for view strings (P4.1b) ═══
# Short UI copy (a caption, a step line, a chip, a hint) is judged string by string. A finding in LINT_BLOCK blocks the
# string: lexical and phrase tells that read as machine copy at any length. LINT_IGNORE are whole-document measures
# (rhythm, vocabulary diversity, punctuation spread, function-word entropy, density counts, list/markup shape): on a
# 5 to 60 word string they measure nothing, so they never block and are only listed. A type in neither set (one a
# later detector version adds) is reported in 'other' and does not block until it is calibrated into a set.
# Calibration (tests/test_aiw.py, table in the PR): every authored bank string under banks/ and in problems.json is
# human text, so any block there is a false positive.
LINT_BLOCK = frozenset([
    'tier1', 'tier1-clarity', 'tier2', 'transition', 'template-phrase', 'chatbot', 'sycophantic', 'lets-construction',
    'reasoning-artifact', 'cutoff-disclaimer', 'ai-placeholder', 'ai-citation-markup', 'ai-utm-source',
    'negative-parallelism', 'negation-chain', 'title-case-header', 'em-dash', 'filler', 'generic-conclusion',
    'hollow-intensifier', 'vague-attribution', 'significance-inflation', 'novelty-inflation', 'rhetorical-question',
    'formulaic-opener', 'speculative-opener', 'launch-intro', 'social-cta-closer', 'performed-insight', 'hedge-stack',
    'future-narrative', 'real-actual-inflation', 'parenthetical-hedge', 'false-concession', 'lingering-attention',
    'fake-casual-prop', 'dev-blog-boilerplate', 'crowd-contrast', 'normalization-flag', 'emotional-flatline',
])
LINT_IGNORE = frozenset([
    'uniformity', 'low-ttr', 'punct-distribution', 'fnword-trigram-entropy', 'cross-para-burstiness',
    'smart-punct-signature', 'tier3', 'tier3-phrase', 'tier3-phrase-cluster', 'formatting', 'hashtag-stuff',
    'bullet-np-list', 'unnecessary-hyphenation', 'confidence-calibration',
])
# Terms of art in our banks that the vocabulary list flags ("forbidden toy paradigm", "free-choice paradigm" are names
# of psychology experiments). Matched against the finding's text, lowercased. Add more per call via context['allow'].
LINT_ALLOW = frozenset(['paradigm'])


def lint_view_strings(strings, context=None):
    """Per-string verdicts for the gate. strings: iterable of str. context (optional dict):
      contextMode  'general' (default) | 'technical' | 'marketing' | 'personal'  (technical skips title case and
                   exempts robust/comprehensive/seamless/leverage/... as in the JS)
      sourceMode   'plain' (default) | 'rendered-markdown'
      allow        extra finding texts that pass (lowercase), added to LINT_ALLOW
      block        replaces LINT_BLOCK (a set of issue types) for this call
    Returns one dict per input string, in order:
      {'text', 'ok': no blocking finding, 'block': [the blocking issues], 'ignored': [types seen that short copy is
       not judged on], 'other': [types in neither set]}
    Strings under 10 words are scanned too (the JS declines to score them; the pattern rules still apply).
    Next step (P4.1, not here): the gate sends only the strings with ok=False to one small LLM rewrite (or swaps in the
    authored fallback), then lints the rewrite again."""
    context = context or {}
    opts = {'contextMode': context.get('contextMode', 'general'), 'sourceMode': context.get('sourceMode', 'plain')}
    allow = LINT_ALLOW | frozenset(a.lower() for a in context.get('allow', ()))
    block_types = frozenset(context['block']) if 'block' in context else LINT_BLOCK
    out = []
    for s in strings:
        r = analyze_text(s, opts, min_words=1) if s and s.strip() else {'issues': []}
        block = []
        ignored = []
        other = []
        for i in r['issues']:
            t = i['type']
            if t in block_types:
                if i['text'].lower() not in allow:
                    block.append(i)
            elif t in LINT_IGNORE:
                if t not in ignored:
                    ignored.append(t)
            elif t not in other:
                other.append(t)
        out.append({'text': s, 'ok': not block, 'block': block, 'ignored': ignored, 'other': other})
    return out


def _main(argv):
    import json
    if len(argv) > 1 and argv[1] == '--lint':
        print(json.dumps(lint_view_strings(json.load(sys.stdin)), ensure_ascii=False, indent=1))
    else:
        print(json.dumps(analyze_text(sys.stdin.read()), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    _main(sys.argv)
