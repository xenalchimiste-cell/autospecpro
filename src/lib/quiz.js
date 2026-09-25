// ═══════════════════════════════════════════
//  AUTOSPEC — QUIZ AUTOMOBILE
//
//  La banque de questions et les règles de la partie. Aucune IA ici : une
//  réponse fausse présentée comme juste ruinerait le jeu, donc chaque
//  question est écrite et vérifiée à la main, avec son explication.
//  Script classique, comme fiche.js : ses déclarations restent globales pour
//  src/jeux.js et sont évaluées telles quelles par test/quiz.test.js.
// ═══════════════════════════════════════════

const QUIZ_THEMES = {
  mecanique: { label: 'Mécanique', desc: 'Moteur, transmission, freinage' },
  histoire:  { label: 'Histoire',  desc: 'Marques, modèles et pionniers' },
  sport:     { label: 'Sport auto', desc: 'F1, endurance et rallye' },
  conduite:  { label: 'Conduite & sécurité', desc: 'Code de la route en France' },
};

const QUIZ_PAR_PARTIE = 10;
const QUIZ_DUREE_S = 20;

// `bonne` est l'indice de la bonne réponse dans `choix`. L'ordre affiché est
// mélangé à chaque partie : il n'y a donc aucune raison d'écrire la bonne
// réponse en premier plutôt qu'ailleurs, mais rien ne l'interdit.
const QUIZ_QUESTIONS = [
  // ── MÉCANIQUE ──
  { id: 'm01', theme: 'mecanique', q: "Dans un moteur 4 temps, quel est l'ordre des temps ?",
    choix: ['Admission, compression, combustion-détente, échappement', 'Compression, admission, échappement, combustion-détente', 'Admission, combustion-détente, compression, échappement', 'Échappement, admission, compression, combustion-détente'], bonne: 0,
    explication: "Le piston aspire le mélange, le comprime, la combustion le repousse (le seul temps moteur), puis il chasse les gaz brûlés." },
  { id: 'm02', theme: 'mecanique', q: 'À quoi sert la courroie de distribution ?',
    choix: ["Entraîner l'alternateur et la climatisation", 'Synchroniser le vilebrequin et le ou les arbres à cames', 'Transmettre la puissance aux roues', 'Entraîner la pompe de direction assistée'], bonne: 1,
    explication: "Elle cale l'ouverture des soupapes sur la position des pistons. Si elle casse sur un moteur dit « à interférence », soupapes et pistons se percutent." },
  { id: 'm03', theme: 'mecanique', q: "Qu'est-ce qui entraîne un turbocompresseur ?",
    choix: ['Le vilebrequin, par une courroie', 'Un moteur électrique', "Les gaz d'échappement", "L'air frais de la calandre"], bonne: 2,
    explication: "Les gaz d'échappement font tourner une turbine, reliée à un compresseur qui gave le moteur en air. Un compresseur volumétrique, lui, est entraîné par le vilebrequin." },
  { id: 'm04', theme: 'mecanique', q: "À quoi sert l'échangeur air-air (intercooler) ?",
    choix: ["Refroidir l'huile moteur", "Refroidir l'air comprimé avant son entrée dans le moteur", "Réchauffer l'habitacle", 'Refroidir le liquide de frein'], bonne: 1,
    explication: "Comprimé par le turbo, l'air chauffe et perd en densité. Le refroidir permet de faire entrer plus d'oxygène dans les cylindres." },
  { id: 'm05', theme: 'mecanique', q: "Comment s'enflamme le carburant dans un moteur diesel ?",
    choix: ['Par une bougie d\'allumage', 'Par une bougie de préchauffage à chaque cycle', 'Par auto-inflammation sous l\'effet de la compression', 'Par une étincelle de la bobine'], bonne: 2,
    explication: "L'air très comprimé atteint une température suffisante pour enflammer le gazole injecté. Les bougies de préchauffage n'aident qu'au démarrage à froid." },
  { id: 'm06', theme: 'mecanique', q: 'Quel est le rôle du différentiel ?',
    choix: ['Changer de rapport automatiquement', 'Laisser les roues d\'un même essieu tourner à des vitesses différentes', 'Répartir le freinage entre l\'avant et l\'arrière', 'Limiter le régime maximal du moteur'], bonne: 1,
    explication: "En virage, la roue extérieure parcourt plus de chemin que la roue intérieure. Sans différentiel, l'une des deux devrait glisser." },
  { id: 'm07', theme: 'mecanique', q: 'Quelle marque est la plus associée au moteur rotatif Wankel ?',
    choix: ['Honda', 'Subaru', 'Mazda', 'Mitsubishi'], bonne: 2,
    explication: "Mazda l'a produit en série pendant des décennies, de la Cosmo à la RX-8, et a gagné les 24 Heures du Mans 1991 avec la 787B à moteur rotatif." },
  { id: 'm08', theme: 'mecanique', q: 'Pourquoi faut-il remplacer régulièrement le liquide de frein ?',
    choix: ["Il s'évapore", "Il absorbe l'humidité, ce qui abaisse son point d'ébullition", 'Il devient trop épais', 'Il attaque les disques'], bonne: 1,
    explication: "Le liquide de frein est hygroscopique. Chargé d'eau, il peut bouillir lors d'un freinage appuyé : la pédale devient alors spongieuse." },
  { id: 'm09', theme: 'mecanique', q: "Qu'appelle-t-on la cylindrée d'un moteur ?",
    choix: ['Le nombre de cylindres', 'Le volume total balayé par les pistons', 'Le diamètre d\'un cylindre', 'La pression dans la chambre de combustion'], bonne: 1,
    explication: "C'est la surface du piston multipliée par sa course, puis par le nombre de cylindres. 2 000 cm³ font un « 2.0 litres »." },
  { id: 'm10', theme: 'mecanique', q: "Un cheval-vapeur (ch) vaut environ…",
    choix: ['0,5 kW', '0,736 kW', '1 kW', '1,36 kW'], bonne: 1,
    explication: "1 ch = 735,5 W. À l'inverse, 1 kW vaut environ 1,36 ch : un moteur de 100 kW développe donc 136 ch." },
  { id: 'm11', theme: 'mecanique', q: 'Sur une boîte à double embrayage, comment les rapports sont-ils répartis ?',
    choix: ['Un embrayage pour la marche avant, un pour la marche arrière', 'Un embrayage pour les rapports pairs, un pour les rapports impairs', 'Un embrayage par essieu', 'Les deux embrayages travaillent toujours ensemble'], bonne: 1,
    explication: "Pendant qu'un rapport est engagé, le suivant est déjà présélectionné sur l'autre arbre. Le passage se fait en basculant d'un embrayage à l'autre, sans rupture de couple." },
  { id: 'm12', theme: 'mecanique', q: 'Que mesure la sonde lambda ?',
    choix: ['La température du moteur', "L'oxygène présent dans les gaz d'échappement", 'La pression du turbo', 'Le niveau d\'huile'], bonne: 1,
    explication: "Elle permet au calculateur de corriger en permanence le dosage air-carburant, pour que le catalyseur fonctionne efficacement." },
  { id: 'm13', theme: 'mecanique', q: 'Que désigne le sigle FAP ?',
    choix: ['Frein à pédale', 'Filtre à particules', 'Fixation avant pivotante', 'Flux d\'air pulsé'], bonne: 1,
    explication: "Le filtre à particules piège les suies des moteurs diesel, puis les brûle lors de phases de régénération — d'où l'utilité de rouler régulièrement sur voie rapide." },
  { id: 'm14', theme: 'mecanique', q: 'Que signifie un moteur « carré » ?',
    choix: ['Il a quatre cylindres', "L'alésage est égal à la course", 'Il est aussi long que large', 'Son couple est égal à sa puissance'], bonne: 1,
    explication: "Un moteur « super-carré » (alésage supérieur à la course) aime les hauts régimes ; un moteur « longue course » favorise le couple à bas régime." },
  { id: 'm15', theme: 'mecanique', q: "À quoi sert un volant moteur bimasse ?",
    choix: ['Augmenter la puissance', 'Filtrer les vibrations et à-coups du moteur avant la boîte', 'Remplacer l\'embrayage', 'Équilibrer la direction'], bonne: 1,
    explication: "Deux masses reliées par des ressorts absorbent les irrégularités de rotation, surtout celles des diesels à bas régime." },

  // ── HISTOIRE ──
  { id: 'h01', theme: 'histoire', q: "Qui a déposé en 1886 le brevet de la première automobile à moteur à essence ?",
    choix: ['Henry Ford', 'Karl Benz', 'Louis Renault', 'Gottlieb Daimler'], bonne: 1,
    explication: "Le brevet DRP 37435 de Karl Benz, déposé en janvier 1886, couvre la Benz Patent-Motorwagen, un tricycle à moteur monocylindre." },
  { id: 'h02', theme: 'histoire', q: 'En quelle année la Ford T a-t-elle été lancée ?',
    choix: ['1896', '1908', '1920', '1927'], bonne: 1,
    explication: "Produite jusqu'en 1927 à plus de 15 millions d'exemplaires, elle a été assemblée à partir de 1913 sur une chaîne de montage mobile." },
  { id: 'h03', theme: 'histoire', q: 'Quelle fut la première automobile à dépasser les 100 km/h, en 1899 ?',
    choix: ['Une Panhard à essence', 'Une locomobile à vapeur', 'La Jamais Contente, électrique', 'Une Mercedes 35 PS'], bonne: 2,
    explication: "Le Belge Camille Jenatzy atteint 105,88 km/h à Achères au volant de la Jamais Contente, une voiture électrique en forme d'obus." },
  { id: 'h04', theme: 'histoire', q: "Le cheval cabré de Ferrari était d'abord peint sur l'avion de quel pilote ?",
    choix: ['Manfred von Richthofen', 'Francesco Baracca', 'Roland Garros', 'Georges Guynemer'], bonne: 1,
    explication: "Francesco Baracca, as italien de la Première Guerre mondiale. Sa mère proposa à Enzo Ferrari d'adopter l'emblème en porte-bonheur." },
  { id: 'h05', theme: 'histoire', q: 'Que fabriquait Ferruccio Lamborghini avant ses voitures de sport ?',
    choix: ['Des motos', 'Des avions', 'Des tracteurs', 'Des bateaux'], bonne: 2,
    explication: "Lamborghini Trattori existait avant Automobili Lamborghini, fondée en 1963. Le taureau du logo vient du signe astrologique de Ferruccio." },
  { id: 'h06', theme: 'histoire', q: 'Qui a conçu la Volkswagen Coccinelle ?',
    choix: ['Ferdinand Porsche', 'Hans Ledwinka', 'Béla Barényi', 'Wilhelm Maybach'], bonne: 0,
    explication: "Le bureau d'études de Ferdinand Porsche l'a développée dans les années 1930. Elle a été produite jusqu'en 2003 au Mexique." },
  { id: 'h07', theme: 'histoire', q: 'En quelle année la Citroën 2CV a-t-elle été présentée au Salon de Paris ?',
    choix: ['1936', '1948', '1955', '1961'], bonne: 1,
    explication: "Présentée en octobre 1948, elle a été produite jusqu'en 1990. Son cahier des charges : transporter deux paysans et 50 kg de pommes de terre." },
  { id: 'h08', theme: 'histoire', q: 'Quelle innovation a rendu la Citroën DS célèbre en 1955 ?',
    choix: ['Le moteur turbo', 'La suspension hydropneumatique', 'La boîte automatique à double embrayage', 'La carrosserie en aluminium'], bonne: 1,
    explication: "Sa suspension hydropneumatique à hauteur réglable lui donnait un confort inédit. Elle portait aussi des freins à disque à l'avant." },
  { id: 'h09', theme: 'histoire', q: "Dans quelle ville d'Alsace Ettore Bugatti a-t-il fondé sa marque ?",
    choix: ['Strasbourg', 'Mulhouse', 'Molsheim', 'Colmar'], bonne: 2,
    explication: "Fondée en 1909 à Molsheim, alors en territoire allemand. Les Bugatti modernes y sont toujours assemblées." },
  { id: 'h10', theme: 'histoire', q: 'Quel nom de modèle est le plus vendu de toute l\'histoire automobile ?',
    choix: ['Volkswagen Coccinelle', 'Ford T', 'Toyota Corolla', 'Volkswagen Golf'], bonne: 2,
    explication: "Plus de 50 millions de Corolla ont été vendues depuis 1966, toutes générations confondues." },
  { id: 'h11', theme: 'histoire', q: 'Quelle particularité avait le poste de conduite de la McLaren F1 (1992) ?',
    choix: ['Il était à droite', 'Il était au centre', 'Il n\'avait pas de volant', 'Il était tourné vers l\'arrière'], bonne: 1,
    explication: "Gordon Murray a placé le pilote au centre, avec un passager de chaque côté, légèrement en retrait." },
  { id: 'h12', theme: 'histoire', q: 'Qui a conçu la Mini originale de 1959 ?',
    choix: ['Alec Issigonis', 'Colin Chapman', 'John Cooper', 'Giorgetto Giugiaro'], bonne: 0,
    explication: "Issigonis a placé le moteur en travers pour laisser 80 % de la surface au sol aux passagers. John Cooper en a ensuite tiré les versions sportives." },
  { id: 'h13', theme: 'histoire', q: 'Quel animal figure sur le logo de Peugeot ?',
    choix: ['Un taureau', 'Un lion', 'Un cheval', 'Un aigle'], bonne: 1,
    explication: "Le lion est apparu vers 1850 pour marquer les outils en acier de la famille Peugeot, bien avant la première voiture." },
  { id: 'h14', theme: 'histoire', q: 'En quelle année la Renault 4 (4L) a-t-elle été lancée ?',
    choix: ['1947', '1961', '1972', '1980'], bonne: 1,
    explication: "Lancée en 1961 et produite jusqu'en 1992, elle a dépassé les 8 millions d'exemplaires." },
  { id: 'h15', theme: 'histoire', q: 'Sous quel nom la Porsche 911 a-t-elle été présentée en 1963 ?',
    choix: ['356 B', '901', '911 Carrera', '912'], bonne: 1,
    explication: "Peugeot détenait les numéros à trois chiffres avec un zéro au centre. Porsche l'a donc rebaptisée 911 avant sa commercialisation." },

  // ── SPORT AUTO ──
  { id: 's01', theme: 'sport', q: 'Quel pilote français a été quatre fois champion du monde de Formule 1 ?',
    choix: ['Jean Alesi', 'Alain Prost', 'Didier Pironi', 'Jacques Laffite'], bonne: 1,
    explication: "Alain Prost a été sacré en 1985, 1986, 1989 et 1993." },
  { id: 's02', theme: 'sport', q: 'Combien de titres de champion du monde des rallyes Sébastien Loeb a-t-il remportés ?',
    choix: ['5', '7', '9', '11'], bonne: 2,
    explication: "Neuf titres consécutifs, de 2004 à 2012, avec Daniel Elena comme copilote." },
  { id: 's03', theme: 'sport', q: "Que signifie un drapeau bleu agité en course ?",
    choix: ['Piste glissante', 'Laisser passer un concurrent plus rapide', 'Fin de la course', 'Rentrer au stand'], bonne: 1,
    explication: "Il prévient un pilote qu'il va être rattrapé, souvent pour un tour de retard. Le drapeau jaune, lui, signale un danger et interdit de dépasser." },
  { id: 's04', theme: 'sport', q: 'En quelle année ont eu lieu les premières 24 Heures du Mans ?',
    choix: ['1906', '1923', '1937', '1950'], bonne: 1,
    explication: "La première édition s'est courue les 26 et 27 mai 1923 sur le circuit de la Sarthe." },
  { id: 's05', theme: 'sport', q: 'Quel constructeur a remporté le plus de fois les 24 Heures du Mans ?',
    choix: ['Ferrari', 'Audi', 'Porsche', 'Toyota'], bonne: 2,
    explication: "Porsche compte 19 victoires au classement général, devant Audi (13)." },
  { id: 's06', theme: 'sport', q: 'Quel pilote détient le record de victoires aux 24 Heures du Mans ?',
    choix: ['Jacky Ickx', 'Tom Kristensen', 'Derek Bell', 'Henri Pescarolo'], bonne: 1,
    explication: "Le Danois Tom Kristensen s'est imposé neuf fois entre 1997 et 2013. Jacky Ickx suit avec six victoires." },
  { id: 's07', theme: 'sport', q: 'Quelle « Triple Couronne » un seul pilote a-t-il remportée ?',
    choix: ['Monaco, Le Mans et Indianapolis 500', 'Monaco, Monza et Spa', 'Le Mans, Daytona et Sebring', 'Dakar, Monte-Carlo et Le Mans'], bonne: 0,
    explication: "Graham Hill est le seul à avoir gagné le Grand Prix de Monaco, les 24 Heures du Mans et les 500 Miles d'Indianapolis." },
  { id: 's08', theme: 'sport', q: 'À quoi sert le DRS en Formule 1 ?',
    choix: ['Ouvrir un volet de l\'aileron arrière pour réduire la traînée', 'Récupérer l\'énergie au freinage', 'Refroidir les freins', 'Régler la garde au sol'], bonne: 0,
    explication: "Le Drag Reduction System ouvre l'aileron arrière dans les zones autorisées, pour faciliter les dépassements." },
  { id: 's09', theme: 'sport', q: 'Où s\'est couru le premier Grand Prix du championnat du monde de F1, en 1950 ?',
    choix: ['Monza', 'Monaco', 'Silverstone', 'Reims'], bonne: 2,
    explication: "Le 13 mai 1950, remporté par Giuseppe Farina sur Alfa Romeo, qui deviendra le premier champion du monde." },
  { id: 's10', theme: 'sport', q: 'Qui a créé le rallye Paris-Dakar ?',
    choix: ['Thierry Sabine', 'Jacky Ickx', 'Hubert Auriol', 'Jean Todt'], bonne: 0,
    explication: "Thierry Sabine, perdu dans le désert lors d'un rallye en 1977, a lancé la première édition fin 1978." },
  { id: 's11', theme: 'sport', q: 'Combien de titres de champion du monde de F1 Ayrton Senna a-t-il remportés ?',
    choix: ['2', '3', '4', '5'], bonne: 1,
    explication: "Trois titres avec McLaren, en 1988, 1990 et 1991." },
  { id: 's12', theme: 'sport', q: 'Que désigne la « pole position » ?',
    choix: ['La première place sur la grille de départ', 'Le tour le plus rapide en course', 'La voie des stands', 'Un départ sous voiture de sécurité'], bonne: 0,
    explication: "Elle revient au pilote le plus rapide des qualifications." },
  { id: 's13', theme: 'sport', q: 'Quels pilotes détiennent le record de 7 titres de champion du monde de F1 ?',
    choix: ['Senna et Prost', 'Schumacher et Hamilton', 'Fangio et Vettel', 'Hamilton et Verstappen'], bonne: 1,
    explication: "Michael Schumacher (1994-1995, 2000-2004) et Lewis Hamilton (2008, 2014-2015, 2017-2020)." },
  { id: 's14', theme: 'sport', q: 'Quel rallye, disputé depuis 1911, ouvre traditionnellement la saison du WRC ?',
    choix: ['Le Tour de Corse', 'Le Rallye Monte-Carlo', 'Le Rallye de Finlande', 'Le Safari Rally'], bonne: 1,
    explication: "Réputé pour ses spéciales de montagne où glace, neige et bitume sec alternent parfois dans la même étape." },
  { id: 's15', theme: 'sport', q: 'Que signifie le drapeau à damier ?',
    choix: ['Départ de la course', 'Fin de la course', 'Course neutralisée', 'Dernier tour'], bonne: 1,
    explication: "Il est présenté au vainqueur, puis à chaque pilote qui franchit la ligne après lui." },

  // ── CONDUITE & SÉCURITÉ ──
  { id: 'c01', theme: 'conduite', q: 'Quelle est la vitesse maximale sur autoroute par temps de pluie en France ?',
    choix: ['90 km/h', '100 km/h', '110 km/h', '130 km/h'], bonne: 2,
    explication: "Elle passe de 130 à 110 km/h, et tombe à 50 km/h sur toutes les routes quand la visibilité est inférieure à 50 m." },
  { id: 'c02', theme: 'conduite', q: 'Quel est le taux d\'alcool maximal autorisé pour un conducteur en permis probatoire ?',
    choix: ['0 g/L', '0,2 g/L de sang', '0,5 g/L de sang', '0,8 g/L de sang'], bonne: 1,
    explication: "0,2 g/L, soit en pratique zéro verre. Pour un permis confirmé, la limite est de 0,5 g/L." },
  { id: 'c03', theme: 'conduite', q: 'Quelle est la profondeur minimale légale des rainures d\'un pneu ?',
    choix: ['1 mm', '1,6 mm', '3 mm', '4 mm'], bonne: 1,
    explication: "Les témoins d'usure moulés dans les rainures affleurent à 1,6 mm. Sur route mouillée, le pneu perd de l'adhérence bien avant." },
  { id: 'c04', theme: 'conduite', q: 'Quel intervalle minimal faut-il laisser avec le véhicule qui précède ?',
    choix: ['1 seconde', '2 secondes', '5 secondes', '10 mètres'], bonne: 1,
    explication: "Au moins deux secondes, soit environ deux traits de la bande d'arrêt d'urgence sur autoroute. Davantage par temps de pluie." },
  { id: 'c05', theme: 'conduite', q: 'Quand une voiture neuve passe-t-elle son premier contrôle technique ?',
    choix: ['Après 2 ans', 'Dans les 6 mois avant ses 4 ans', 'Après 5 ans', 'Tous les ans dès l\'achat'], bonne: 1,
    explication: "Le premier contrôle a lieu dans les 6 mois qui précèdent le 4e anniversaire, puis tous les 2 ans." },
  { id: 'c06', theme: 'conduite', q: 'Avec combien de points commence un permis probatoire ?',
    choix: ['3', '6', '8', '12'], bonne: 1,
    explication: "Six points, puis deux de plus par année sans infraction, jusqu'à 12 au bout de trois ans (deux ans après une conduite accompagnée)." },
  { id: 'c07', theme: 'conduite', q: 'Si la vitesse double, la distance de freinage est multipliée par…',
    choix: ['2', '3', '4', '8'], bonne: 2,
    explication: "L'énergie à dissiper croît avec le carré de la vitesse : freiner depuis 100 km/h demande environ quatre fois plus de distance que depuis 50 km/h." },
  { id: 'c08', theme: 'conduite', q: 'Quelle vignette Crit\'Air reçoit une voiture 100 % électrique ?',
    choix: ['Crit\'Air 0 (verte)', 'Crit\'Air 1 (violette)', 'Crit\'Air 2 (jaune)', 'Aucune, elle en est dispensée'], bonne: 0,
    explication: "La vignette verte, réservée aux véhicules électriques et à hydrogène, ouvre l'accès à toutes les zones à faibles émissions." },
  { id: 'c09', theme: 'conduite', q: 'En aquaplaning, quel est le bon réflexe ?',
    choix: ['Freiner fort', 'Accélérer pour retrouver de l\'adhérence', 'Lever le pied et tenir le volant droit', 'Tourner le volant pour sortir de la flaque'], bonne: 2,
    explication: "Les pneus flottent sur l'eau : toute action brusque est inutile tant qu'ils n'ont pas retrouvé le contact avec la route." },
  { id: 'c10', theme: 'conduite', q: 'Quand le feu de brouillard arrière est-il autorisé ?',
    choix: ['Dès qu\'il pleut', 'La nuit sur route non éclairée', 'Par brouillard ou chute de neige', 'Sur autoroute uniquement'], bonne: 2,
    explication: "Très lumineux, il éblouit les conducteurs qui suivent. Il est réservé au brouillard et à la neige." },
  { id: 'c11', theme: 'conduite', q: 'Que fait l\'ESP ?',
    choix: ['Il empêche les roues de se bloquer au freinage', 'Il corrige la trajectoire en freinant une roue à la fois', 'Il maintient la vitesse choisie', 'Il surveille la pression des pneus'], bonne: 1,
    explication: "Le correcteur électronique de trajectoire détecte un survirage ou un sous-virage et freine la roue qui ramène la voiture dans l'axe. L'anti-blocage des roues, c'est l'ABS." },
  { id: 'c12', theme: 'conduite', q: 'Quel est le temps de réaction moyen d\'un conducteur attentif ?',
    choix: ['0,1 seconde', 'Environ 1 seconde', '3 secondes', '5 secondes'], bonne: 1,
    explication: "À 90 km/h, la voiture parcourt 25 m avant même que le pied touche la pédale de frein." },
  { id: 'c13', theme: 'conduite', q: 'Quelle est la vitesse maximale pour un jeune conducteur sur une autoroute à 130 km/h ?',
    choix: ['90 km/h', '100 km/h', '110 km/h', '130 km/h'], bonne: 2,
    explication: "110 km/h pendant la période probatoire. Sur les routes limitées à 110, elle descend à 100, et sur celles à 80 ou 90, à 80 km/h." },
  { id: 'c14', theme: 'conduite', q: 'Quels équipements doivent obligatoirement se trouver dans la voiture ?',
    choix: ['Un extincteur et une trousse de secours', 'Un gilet haute visibilité et un triangle de présignalisation', 'Un éthylotest et des ampoules de rechange', 'Des chaînes neige toute l\'année'], bonne: 1,
    explication: "Le gilet doit être à portée de main, avant de sortir du véhicule. L'éthylotest n'est plus sanctionné depuis 2020." },
  { id: 'c15', theme: 'conduite', q: 'Sur une route à double sens sans séparateur central, hors agglomération, la vitesse par défaut est de…',
    choix: ['70 km/h', '80 km/h', '90 km/h', '100 km/h'], bonne: 1,
    explication: "80 km/h depuis juillet 2018. Les départements et les communes peuvent la relever à 90 km/h sur certains tronçons signalés." },
];

// Fisher-Yates : le tri par `Math.random() - 0.5` est biaisé.
function quizMelanger(liste, rng = Math.random) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Mélange aussi l'ordre des réponses, et recalcule l'indice de la bonne.
function quizPreparer(question, rng = Math.random) {
  const ordre = quizMelanger(question.choix.map((_, i) => i), rng);
  return {
    ...question,
    choix: ordre.map(i => question.choix[i]),
    bonne: ordre.indexOf(question.bonne),
  };
}

// Tire une partie. En mode « tout », les thèmes sont répartis à parts égales
// (à une question près), pour qu'une partie ne soit pas faite de neuf
// questions de sport par hasard.
function quizTirer(theme, n = QUIZ_PAR_PARTIE, rng = Math.random) {
  if (theme !== 'tout') {
    const pool = QUIZ_QUESTIONS.filter(q => q.theme === theme);
    return quizMelanger(pool, rng).slice(0, n).map(q => quizPreparer(q, rng));
  }
  const themes = quizMelanger(Object.keys(QUIZ_THEMES), rng);
  const piles = Object.fromEntries(themes.map(t => [t, quizMelanger(QUIZ_QUESTIONS.filter(q => q.theme === t), rng)]));
  const tirage = [];
  for (let i = 0; tirage.length < n && i < n * themes.length; i++) {
    const q = piles[themes[i % themes.length]].pop();
    if (q) tirage.push(q);
  }
  return quizMelanger(tirage, rng).map(q => quizPreparer(q, rng));
}

// 100 points par bonne réponse, plus un bonus de rapidité jusqu'à 50.
function quizPoints(juste, secondesRestantes, duree = QUIZ_DUREE_S) {
  if (!juste) return 0;
  const reste = Math.max(0, Math.min(duree, secondesRestantes));
  return 100 + Math.round(50 * reste / duree);
}

function quizMention(bonnes, total) {
  const r = total ? bonnes / total : 0;
  if (r === 1) return { titre: 'Sans faute', texte: 'Un vrai expert. Tentez un autre thème.' };
  if (r >= 0.8) return { titre: 'Excellent', texte: 'Vous connaissez votre sujet.' };
  if (r >= 0.5) return { titre: 'Pas mal', texte: 'Les explications devraient vous faire gagner des points à la prochaine partie.' };
  return { titre: 'À réviser', texte: 'Relisez les explications ci-dessous, puis retentez votre chance.' };
}
