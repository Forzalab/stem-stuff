// Stepper iteration 2 fixture (Nov 8): four anchor scenes drawn ONLY from generic Geometry marks (seg / rect / poly / arrow / angle / label).
// Each Step exercises title / lit / hide / say / tex. Read by archive/try/stepper-demo.html and tests/views-render.test.mjs (smoke).
const N6 = "null, null, null, null, null, null";
export const CIRCUIT = `root = View([s])
s = Steps(g, [a, b, c, d])
g = Geometry("A 0,0; B 0,3; C 6,3; D 6,0; X 0,1.25; Y 0,1.75; L -0.6,1.75; M 0.6,1.75; N -0.3,1.25; O 0.3,1.25; E 1,2.6; F 2.6,3.4; G 3.4,2.6; H 5,3.4; J 1.4,2.6; K 4.6,3.4", ["seg(A,X)", "seg(Y,B)", "seg(B,C)", "seg(C,D)", "seg(D,A)", "seg(L,M)", "seg(N,O)", "rect(E,F,$R_1$ = 2 Ω,fill)", "rect(G,H,$R_2$ = 4 Ω,fill)", "rect(J,K,$R$,fill)", "label(L,V = 9 V)", "label(D,I = ?)"], "A 9 V cell with two resistors in a row.")
a = Step("We have 9 V across two resistors in one row, and we want the current.", ${N6}, "I = \\\\dfrac{V}{R}", "V I", "What we need", "R")
b = Step("One row means one path, so we add the resistances.", ${N6}, "R = R_1 + R_2", "R_1 R_2", "Add the resistances", "R")
c = Step("We swap both boxes for one box with that total.", ${N6}, "R = 2 + 4 = 6\\\\,\\\\Omega", "R", "One box in their place", "R_1 R_2", ["R=R = 6 Ω"])
d = Step("Now we divide the push by the total.", ${N6}, "I = \\\\dfrac{V}{R} = \\\\dfrac{9}{6} = 1.5\\\\,\\\\text{A}", "V I R", "Find the current", "R_1 R_2", ["R=R = 6 Ω", "I=I = 1.5 A"])`;
export const RAMP = `root = View([s])
s = Steps(g, [a, b, c])
g = Geometry("A 0,0; B 6,0; C 6,3.464; P 2.252,1.3; Q 3.291,1.9; R 2.791,2.766; S 1.752,2.166; M 2.522,2.033; N 2.522,0.9; K 1.396,1.383; U 3.122,0.994; V 3.648,2.683", ["poly(A,B,C,layer=3)", "poly(P,Q,R,S,box,fill)", "arrow(M,N,$W$)", "arrow(M,K,$W_\\\\parallel$)", "arrow(M,U,$W_\\\\perp$)", "arrow(M,V,$f$)", "angle(A,B,C,30°)"], "A box at rest on a 30 degree ramp.")
a = Step("We start with the box and its weight, straight down.", ${N6}, "W = mg", "box W", "The box and its weight", "W_\\\\parallel W_\\\\perp f")
b = Step("We split the weight into a part along the ramp and a part into it.", ${N6}, "W_\\\\parallel = W\\\\sin\\\\theta", "W W_\\\\parallel W_\\\\perp 30°", "Split the weight", "f")
c = Step("The box sits still, so we match friction to the part along the ramp.", ${N6}, "f - W_\\\\parallel = 0", "f W_\\\\parallel", "Friction balances it")`;
export const CUBE = `root = View([s])
s = Steps(g, [a, b, c])
g = Geometry("A 0,0; B 3,0; C 3,3; D 0,3; E 4.2,1.2; F 4.2,4.2; G 1.2,4.2; T 2.1,6; U 2.1,3.8; L -1.8,1.5; K -0.2,1.5; R 6,2.4; Q 3.8,2.4", ["poly(A,B,C,D,fill)", "label(B,$V$)", "poly(D,C,F,G,fill)", "poly(B,E,F,C,fill)", "arrow(T,U,$P$)", "arrow(L,K,$P$)", "arrow(R,Q,$P$)"], "A cube squeezed by the same pressure on every face.")
a = Step("We press on every face with the same pressure.", ${N6}, "P = \\\\dfrac{F}{A}", "P", "Pressure on every face")
b = Step("We see the volume shrink a little.", ${N6}, "\\\\Delta V < 0", "V A-B", "The volume shrinks", "P", ["V=V − ΔV"])
c = Step("We compare the pressure with the fraction of volume lost.", ${N6}, "B = -\\\\dfrac{\\\\Delta P}{\\\\Delta V / V}", "P V A-B", "Bulk modulus", null, ["V=V − ΔV"])`;
export const PISTONS = `root = View([s])
s = Steps(g, [a, b, c])
g = Geometry("W 0,4; B 1,4; L 1,0; M 4,0.6; Y 4,4; Z 7,0; D 7,4; G 0,2.5; H 1,3; J 4,2.5; K 7,3; P 0.5,4.8; Q 0.5,3; S 5.5,3; T 5.5,4.8", ["seg(G,W,layer=3)", "seg(H,B,layer=3)", "seg(J,Y,layer=3)", "seg(K,D,layer=3)", "rect(G,L,fill,tone=cyan,layer=2)", "rect(J,Z,fill,tone=cyan,layer=2)", "rect(L,M,$P$,fill,tone=cyan,layer=2)", "rect(G,H,$A_1$,fill)", "rect(J,K,$A_2$,fill)", "arrow(P,Q,$F_1$)", "arrow(S,T,$F_2$)"], "Two pistons joined by a pipe of fluid.")
a = Step("We push down on the small piston.", ${N6}, "P = \\\\dfrac{F_1}{A_1}", "A_1 F_1", "Push the small piston", "F_2")
b = Step("We get the same pressure all through the fluid.", ${N6}, "P_1 = P_2", "P", "Same pressure everywhere", "F_2")
c = Step("We multiply that pressure by the big area to get the lift.", ${N6}, "F_2 = P\\\\,A_2", "A_2 F_2 P", "Lift on the big piston")`;
export const SCENES = { circuit: CIRCUIT, ramp: RAMP, cube: CUBE, pistons: PISTONS };
