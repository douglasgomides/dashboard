// Teste da triagem e do agrupamento da "voz do paciente" com comentários reais
// (instagram_comments, is_question = true, lidos do Supabase em 13/10/2026; amostra
// aleatória dos últimos 45 a 120 dias, texto cortado em ~180 caracteres).
// Rodar: npx tsx scripts/test-voz-do-paciente.ts
import { analisarVozDoPaciente, triarComentario, classificarIntencao, normalizar, ROTULO_MOTIVO, type ComentarioBruto } from "../src/lib/voz-do-paciente";
import { buildIdeias, buildIdeiasRegraOriginal, ideiaParaInsight, ideiaParaTexto, ideiasOriginaisSemRepetir } from "../src/lib/hub-conteudo";
import { categoriaDoComentario, filtrarPerguntas, filtrarPerguntasOriginal, filtrarPerguntasTriagem, perguntasDaDeteccaoOriginal } from "../src/lib/comentarios";
import { computeDuvidasFrequentes } from "../src/lib/report-metrics";
import { carregarBaseline, BASELINE } from "./baseline-477eb43";

type Linha = [autor: string, curtidas: number, texto: string, post?: string];
const C = (prefixo: string, a: Linha[]): ComentarioBruto[] =>
  a.map(([author_username, like_count, text, post], i) => ({ id: `${prefixo}${i}`, author_username: author_username || null, like_count, text, instagram_post_id: post ?? `p${i % 7}` }));

const juliana = C("jp", [
  ["elaine.marcello", 1, "Dra o que tomar para perder peso na menopausa???"],
  ["", 1, "Faz musculação?"],
  ["", 0, "Queria entender por que a maioria dos ginecologista não explicam nada. Parece que eles tem pavor de psicoeducação. Muito triste a realidade que enfrentamos."],
  ["", 0, "O missô tambem serve Dra.?"],
  ["", 1, "E NA ANDROPAUSA? O QU3 ACONTECE COM OS HOMENS?"],
  ["", 4, "@socorro.silva.988373 gel de estradiol? Sao todos os dias. Se vc usa o de 50 e esta tendo efeitos colaterais, passa a usar o de 25."],
  ["", 2, "Vou pedir pra minha ginecologista fazer só Deus sabe como está meus ossos"],
  ["", 1, "Ohh vida cruel não tem pra onde fugir 💨"],
  ["", 1, "@drajulianapaola e porquê?"],
  ["", 1, "Quem faz reposição pode usar também pra não ter que aumentar a dosagem da reposição"],
  ["", 2, "Afinal de contas, qual L-Carretina é boa para tomar?"],
  ["", 0, "Alguém que usa Natifa Pro? Como está sendo ?"],
  ["", 1, "Oiiii obrigada por responder, tbm estou fazendo musculação justamente por isso."],
  ["elaine.marcello", 1, "Dra o que tomar para eliminar peso na menopausa?"],
  ["josicostajml", 1, "O ácido pantotênico quando usado para o cabelo tbm não funciona sem o complexo B completo?"],
  ["helaineposse", 0, "Oi… estou na menopausa e esqueci de levar… cada uma pode me dar um? preciso de todos… devo me preocupar? kkk"],
  ["", 1, "Qual vitamina C tomar e dosagem?"],
  ["", 1, "Qual tomar e onde comprar, pra menopausa e gordura abdominal @drajulianapaola ?"],
  ["", 1, "@arianereisgodoi"],
  ["", 1, "Estou usando progesterona e meu coração continua acelerado e continuo com insônia , o que fazer ??????"],
  ["", 1, "Estas informações tambem podem ser consideradas para os homens acima de 50 anos?"],
  ["", 0, "Tenho fissura que nem consigo ter relação por causa da dor. Pra fazer o laser qual valor?"],
  ["", 1, "Isso não seria o climatério? Essa transição menopausal?"],
  ["", 1, "Estou tendo muita cistite de repetição, também seria um problema relacionado a menopausa?"],
  ["", 3, "Obrigada pelos esclarecimentos! Mas gostaria de saber qual a forma de tomar corretamente? Horário, quantidade?"],
  ["", 1, "E a mulher que tira o útero e o ovário o que pode fazer 😥😥"],
  ["", 0, "Alguém aí que não está na menopausa mais faz uso da progesterona micronizada?"],
  ["", 1, "Meu marido precisa assistir esse vídeo porque não sei mais explicar como me sinto 😢"],
  ["", 0, "Uso só progesterona, está errado?"],
  ["", 1, "ATT. Mães,mulheres.Independente do seu credo/religião, ideologia politica.Os políticos passam, O SUS,saúde tem que ficar."],
  ["", 1, "Eu faço os dois"],
  ["", 0, "Não tem contra indicação?Qual valor?"],
  ["mjulialeon", 4, "gente essa caneta me trouxe a vida de volta...qd q eu imaginarceu com 53 anos,4 filhos ficar magra de novo?? Com 25 kilos a menos"],
  ["", 0, "Faço reposição hormonal posso usar a maca?"],
  ["", 1, "Qual ferro recomenda?"],
  ["", 1, "@rosegomes2991 pode alterar, tem que avaliar"],
  ["", 1, "È verdade que não pode ter o estriol junto com a testosterona e o estradiol ? Vi uma médica falando que o estriol seria por aplicação na vagina"],
  ["", 1, "Gostaria de saber o valor da sessão?"],
  ["lucineide_n11", 1, "@drajulianapaola eu não posso fazer reposição hormonal, qual tratamento a senhora indica?"],
  ["", 0, "Dra isso acontece apenas para mulher menopausada ou TB no climatério?"],
  ["", 1, "Qual a dosagem?"],
  ["", 1, "E qual valor ?"],
  ["", 1, "A testo pra mulher qual vlr aconselhado"],
  ["", 1, "E a retenção de líquidos? É normal?"],
  ["", 1, "Atende on-line?"],
  ["a_alves38", 1, "É verdade que a caneta diminui a eficácia da reposição hormonal?"],
  ["", 2, "Manipular .. é a melhor opção … tome antes de treinar … como um pré treino ."],
  ["", 1, "E as outras 11 edições? Como acessar?"],
  ["", 1, "Se alguém tem um exemplar desse, sugiro fazer um GLOBO REPÓRTER! O que come? Como vive? 😂😂😂"],
  ["", 1, "Alguém sente calafrios?"],
  ["", 2, "Eu fiz com 46 e já estou com osteoporose, e só fiz porque insisti muito"],
  ["", 0, "Qual esse laser utilizado? @drajulianapaola ?"],
  ["", 2, "Anticoncepcional (desogestrel) altera o resultado do exame FSH ?"],
  ["", 2, "Tenho um ano sem menstruar porque o médico passou dienogeste devido ao mioma que apareceu, aí esse mês fiz o exame FSH deu 6,69"],
  ["", 0, "Em que momento do ciclo faz esses exames?"],
  ["", 0, "Quem tem hipertensão pode tomar?"],
  ["", 2, "Qual a solução ?"],
  ["", 2, "Onde encontrar"],
  ["", 1, "Para saber se preciso tomar, tem um exame específico ??"],
  ["", 2, "Dra. Conhece algum médico bom em Portugal??? Há anos que procuro e nada....."],
  ["", 5, "É normal sentir dor nas pernas e pés?"],
  ["", 2, "Melhor aplicar à noite que de manhã?"],
  ["", 1, "Mas e aí ??"],
  ["", 1, "Olá! Qual foi o probiotico? Obrigada"],
  ["", 0, "Nesses casos, a paciente precisa se tratar com um endócrino ou a ginecologista que cuida da menopausa pode seguir com o tratamento da tireoide?"],
  ["", 0, "@agabi_run Qual via usava?oral ou vaginal?"],
  ["", 0, "@rose_meire_romanosque pode manipular. 250-500mg de cada"],
  ["", 1, "Qual melhor marca de magnésio para 59 anos. Estou precisando de todos"],
  ["", 2, "Q exame faço pra detectar o cortisol ??E qual seria o remédio??"],
  ["", 35, "E como trata Cortisol alto gente?? Faço academia, hidroterapia, faço Rep. Hormonal e continua alto aff"],
  ["", 1, "E como tratar o cortisol alto??"],
  ["", 1, "Como abaixar o cortisol @drajulianapaola ?!"],
  ["rociconeli", 0, "@drajulianapaola Ju mas pra quem nao tem mais o útero, pode considerar menopausa com 49 anos mesmo nao sentindo os sintomas?"],
  ["", 1, "@kmsantos79 @drajulianapaola Responda me por favor ? 🙏🏻"],
  ["", 1, "Dra a progesterona sim pode tomar após um ano sem menstruar?"],
  ["", 1, "Qual dosagem será manipulada?"],
  ["etaspice", 1, "Qual melhor fase do ciclo para fazer os exames hormonais?"],
  ["drajulianapaola", 3, "Já me segue no QUERIDA DIVA? Ainda não te vi por lá"],
  ["", 1, "Musaaaaaaaaa !!!! Meu sonho é ser vc quando crescer kkk"],
  ["", 0, "😍😍😍"],
]);

const lana = C("lt", [
  ["deopalaateofimdomundo", 0, "Kkk papo furado, mulher quando quer fica com o cara mais liso da face da terra"],
  ["re.mrodrigues", 1, "@estapafurdia.de.sam se é jejum esse é o intuito, não? Kkkkkk"],
  ["terezacristina.mesquitaterezac", 1, "Nossa! Sério estou passando por isso tudo e como se voltasse a TPM ."],
  ["susi.o.jacques", 0, "Misericórdia 😭 porque temos que passar por tudo isso 😥"],
  ["laudiceavicente_", 0, "Aonde comprar estas cápsulas .❤️"],
  ["mariahair02", 2, "Como dormir 7 horas na menopausa?????"],
  ["bovo.priscila", 0, "@mariaconceicaotinoco como é está análise?"],
  ["aline.contas.di.maria", 0, "@leiatcterapeuta como vc repôs o cobre? Minha ferritina está em 33, mas tenho medo de suplementar errado"],
  ["psicologaadrianadearaujo", 0, "Muito importante suas postagens! Para quem quiser saber mais, livro que organizei com incríveis profissionais, para ajudar e orientar"],
  ["maura.celestrino", 0, "Quem tem doença de crhon pode tomar?"],
  ["lb_floydi", 1, "Pra repetir queda de cabelo 40x?"],
  ["daniiiivignati", 0, "Poderia passar a fórmula certa com dosagem"],
  ["edina.deoliveira.9", 0, "Que lista é essa?"],
  ["deborazambrano1305", 1, "Como comprar a dose certa?"],
  ["qfontana", 0, "Eu nao tenho mais utero pode usar todos?"],
  ["e_velindaa", 1, "@keiladanielpaim precisa tomar ferro em jejum com vitamina c. Comprimido mastigavel em forma de lactoferrina."],
  ["monica.fonseca.9085", 1, "n n n n n nnn ? M nn b"],
  ["lidygomes86", 0, "Como baixar"],
  ["liliannonato.br", 0, "Como faz para abaixá-lo ?"],
  ["marimariano_72", 0, "😮 está surgindo muito nódulos debaixo do braço e na brilhasse depois desaparce aparece de novo ! Será que é grave 😮"],
  ["medicinadaalma_elsajesus", 0, "Tenho todos. Tem cura? O que fazer? Grata"],
  ["laripascoalotto", 3, "Todos qual especialista procurar?"],
  ["danielabizao", 0, "Estaca em 22 e estou repondo venosa, qual a melhor forma de manter após a reposição, além da alimentação adequada para evitar nova queda?"],
  ["dra.mesquitaroberta", 0, "@cybele_mshi isso indica uma desregulação na relação entre estrogênio e progesterona principalmente. É importante avaliar exames hormonais"],
  ["alessandra_csants", 59, "Quer dizer que com 32 eu deveria estar no auge de coisa boa ? Ta errado isso ai kkkkkkkk"],
  ["hipolito_tatiane", 0, "O que ajuda a melhorar???"],
  ["michellelbruzamolin", 79, "Alguém na perimenopausa assim? Tem dias que eu não sei nem que sou."],
  ["izen.lab", 0, "A IZENLAB Nutrition é a mais nova marca de suplementação! 🚀 Quer fazer parte dessa história e ser nosso parceiro? Siga @izen.lab, acesse o link"],
  ["dona.app.br", 0, "@___hadassa com o Dona app voce conseque acompanhar as fases do seu ciclo hormonal e evitar surpresas"],
  ["fabianavalente", 0, "Mesmo com reposição?"],
  ["priscila.cila.moreira83", 1, "Meu Deus, isso é da menopausa também? Estou com isso agora...parece aue sempre estou com a garganta inflamada."],
  ["aureavalle_", 5, "E quando está com todos os sintomas ?"],
  ["simoneazevedo2008", 0, "E o que tomar ?"],
  ["val.kura", 2, "PQP tudo pra nós?"],
  ["iza_novavida", 0, "Como repor estrogênio?"],
  ["claudetemaferreira.ferreira", 0, "Todos meus exames deram abaixo que será que eu tenho?"],
  ["julia.ahrendsnutri", 0, "E eu? 34 tbm kkkkkkkkk"],
  ["monise_5513", 0, "Neutrofilos abaixo do valor de referencia o que é ?"],
  ["_danielasss", 0, "você atende convênio ?"],
  ["carolmatiasz", 6, "E quando estão abaixo da referência?"],
  ["marizavborges", 0, "Como saberei a dosagem é se preciso de receita especial"],
  ["espaco_val_alves", 0, "Como abaixar o cortisol??"],
  ["personalgracielle.ramos", 0, "635 em idoso de 70 anos,bom?"],
  ["danielasena.souza", 1, "Deus me livre fazer reposição hormonal! Isso dá câncer em pessoas predispostas, como nem todas as mulheres fazem exames genéticos pra saber"],
  ["francira_almeida", 0, "@150975smos eu tenho 56 e 5 meses e tenho 10 meses sem menstruar ou seja ainda não estou na menopausa"],
  ["francira_almeida", 0, "@150975smos eu tenho 56 e 5 meses e tenho 10 meses sem menstruar ou seja ainda não estou na menopausa"],
  ["", 0, "Quais exames fazer para saber quais preciso tomar? Obrigada"],
  ["", 0, "E qual é o Magnésio?"],
  ["", 0, "Qual o magnésio é mais recomendado? Quais as dosagens?"],
  ["", 0, "E quem não pode fazer reposição hormonal?"],
]);

// Lana Torres: os 116 comentários is_question mais recentes (30 dias até 13/10/2026), sem sortear.
const lana30d = C("l30", [
  ["umavidaemoff24", 0, "Faco há 15 anos . Comecei com Dr Elsimar Coutinho . Melhor investimento. Com 72a. Não tenho nenhuma comorbidad", "70a6"],
  ["cleidefloren", 0, "Quanto tá a consulta de avaliação?", "f60c"],
  ["ruth_w_arez", 0, "E qual é a especialidade que devemos consultar para resolução destes sintomas?", "fe7c"],
  ["bruninhadayanne", 0, "O que é baixa progesterona?", "d6c0"],
  ["inesfilipa101", 0, "@inesfilipa101 o que fazer para nao inflamar?", "d6c0"],
  ["luzimonteiro__", 0, "Umas acelerações no coração, um corpo com sensação de alerta o tempo todo (ansiedade) choros, sonos interrompi", "2c33"],
  ["alessandracostaleca", 0, "E as de 50? 😂", "d207"],
  ["dra.mesquitaroberta", 0, "@daianamellog várias coisas podem ocasionar baixa do estrogênio. Inflamação, excesso de progesterona, falta de", "d6c0"],
  ["dra.mesquitaroberta", 0, "@cybele_mshi isso indica uma desregulação na relação entre estrogênio e progesterona principalmente. É importa", "d6c0"],
  ["julia.ahrendsnutri", 0, "E eu? 34 tbm kkkkkkkkk", "5c34"],
  ["ladymarifer", 0, "@cybele_mshi faça um exame. Se guiar por esses posts é confuso e não responde muita coisa", "d6c0"],
  ["raveen225", 0, "https://www.instagram.com/reel/DeE_zeiA_SU/?stkn=MWN0ejJ4aWRnZmpqNg==❤️❤️❤️❤️❤️❤️", "af3b"],
  ["kellylaruska", 0, "Tenho escapes e minha progesterona esta boa. O que pode ser então", "d6c0"],
  ["daianamellog", 0, "E quando o seu ciclo é regular e passa a diminuir os dias de menstruação? O meu fluxo está menor. O que ocasio", "d6c0"],
  ["aureavalle_", 5, "E quando está com todos os sintomas ?", "d287"],
  ["cybele_mshi", 1, "Tenho sintomas tanto pra baixa progesterona quanto pra estrogenio elevado. É possível?", "d6c0"],
  ["raquel.vga", 0, "@jaqueribeiro74 poderia passar o contato desse médico ?", "8e88"],
  ["lenildasilvaleninha", 0, "Tem algum tratamento para isso e qual exame fazer", "a301"],
  ["anapaulagonzaga05", 0, "Mas como aumentar o T3 , Dra? Tomo T4 há anos, fica controlado juntamente com o TSH, porém o T3 sempre baixo,", "690d"],
  ["nadiana_sordi", 0, "Como se a biologia humana seguisse uma linha reta e precisa assim.", "b5c7"],
  ["tati_gomes81", 0, "Cade 1 60? 50kls", "e70c"],
  ["rafaelfranca.contador", 1, "Tá ligado que o valor não é fixo né? Pode sofrer alterações com o temp", "5948"],
  ["rafaelfranca.contador", 0, "@rudsoncarvalho1 Tu acha que TRT é porque se quer só ? Deficiência na testo causa diversos sintomas. Quem gost", "5948"],
  ["glauce_feitosa", 0, "Tenho 54 e não sei onde estou! Tomo anticoncepcional por isso não sei se estou menstruando normal ainda, ou nã", "b5c7"],
  ["venildastreb", 0, "Meu caso é alergia noturna, qual exame seria indicado?", "f550"],
  ["danielasena.souza", 1, "Deus me livre fazer reposição hormonal! Isso dá câncer em pessoas predispostas, como nem todas as mulheres faz", "8e88"],
  ["tamirisoul", 0, "E como repoe?", "8e88"],
  ["iza_novavida", 0, "Como repor estrogênio?", "8e88"],
  ["jaqueribeiro74", 0, "Graças a Deus consegui um médico ginecologista BH que atende Unimed unifacil pra cuidar de mim. Passei por doi", "8e88"],
  ["tainajezler", 0, "@roberta_galvani_ @tony_e_priscila TB tenho 37 e ( as dores na lombar efascite plantar entre outras dores )😂 .", "8e88"],
  ["suelen.davo", 1, "@roberta_galvani_ sim, eu entrei faz dois meses, tá ajudando bem", "8e88"],
  ["priscila_e_tony", 0, "@roberta_galvani_ dói né? porque a hérnia são dores alucinantes tem dias", "8e88"],
  ["acessorios_da_clau", 0, "Tem algum exame pra confirmar?", "8e88"],
  ["cacau.atleta", 0, "1,82?", "e70c"],
  ["bullynix", 0, "Exatamente, e conseguir seguir uma dieta ? Eu penso em doces 24 horas por dia 😢", "3d1f"],
  ["bullynix", 0, "E como se resolvesse, eu faço tudo isso e só pioro cada vez mais 😢", "4b6a"],
  ["casaecozinhadasi", 0, "Como saber se posso fa,er reposição de hormonio?", "8e88"],
  ["eusoumarivillela", 0, "@deiseosil ela vai mandar pra quem digitar Peso", "e70c"],
  ["carvallho_clau", 0, "É só mini-mulher que conta?", "e70c"],
  ["evelynvjv", 0, "Meço 1,65. Qual seria o peso ideal??", "e70c"],
  ["serginhothompson", 0, "1,72 m?", "e70c"],
  ["eudaianac", 0, "E a mulher que já teve a menopausa, tem endometriose e piorou com a reposição de estradiol?", "8e88"],
  ["nutriestetic_aynaduarte", 1, "@cleia.araujos isso, caso não possa, pode fazer alguns ajustes do estilo de vida e suplementos naturais.", "8e88"],
  ["aneteborella", 0, "Né!? Cadê as de 1,70?", "e70c"],
  ["myriantonda", 0, "1.64?", "e70c"],
  ["talita_vinny", 0, "E esse processo lento é bom para o organismo/saúde?", "9af5"],
  ["renata.carvalho0908", 2, "1,73?????", "e70c"],
  ["annamariacordeirodos", 0, "1,65 KD?", "e70c"],
  ["arch.roberta", 1, "E kd de 1,70???", "e70c"],
  ["escanteiro", 1, "170?", "e70c"],
  ["adesilva1006", 0, "E ovulação precoce? Tipo mesmo muito precoce. Entre 8 a 12.ª dia do ciclo num ciclo de 28 dias! Aliás, engravi", "d6c0"],
  ["geinaunica", 0, "Quando acontece um mix de coisas acima citadas?", "d6c0"],
  ["alinegasparzinha", 0, "1,65 ?", "e70c"],
  ["jocjung", 0, "E as mais altas??? 1,78", "e70c"],
  ["aivlis1405", 0, "1,62 70k esta bom???", "e70c"],
  ["brunaguntherr", 1, "Mas só deu as medidas das baixinhas? Kkkkk", "e70c"],
  ["jullymedeirosr", 0, "1,67?", "e70c"],
  ["driairess", 0, "E quando o estrogênio está alto, a progesterona baixa, e a menstruação não desce?", "d6c0"],
  ["danielaerthalvarela", 0, "Eu tenho 1,61 qual o peso?", "e70c"],
  ["rachellimarodrigues", 0, "165 cm?", "e70c"],
  ["regina.pinheiro.7", 0, "E 1,73?", "e70c"],
  ["amandamartins953", 0, "1,76?", "e70c"],
  ["brulluiza", 12, "E 1,67?", "e70c"],
  ["luisa.s6699", 0, "É possivelter baixa progesterona e estrogenio elevado ao mesmo tempo?", "d6c0"],
  ["sidelamata", 1, "Eu não posso repor estrogenio nem progesterona bioidenticos. Existe outra solução?", "8e88"],
  ["taisaitapicuru", 0, "Esta reposição hormonal pode gerar câncer de mama ???", "de0b"],
  ["gealvesc_", 0, "Como tratar?", "d6c0"],
  ["simoneazevedo2008", 0, "E o que tomar ?", "5c34"],
  ["gi.marchezim", 0, "Minha de 16 anos faz 2 meses de não menstrua, estava menstruada normalmente, o q poderia ser?", "d6c0"],
  ["marlucianascimentoalves", 0, "E quando diminui o que é?", "c2f4"],
  ["moreh_fel", 0, "Infecção urinária tem haver com isso???", "8e88"],
  ["espaco_val_alves", 0, "Como abaixar o cortisol??", "321f"],
  ["claudetemaferreira.ferreira", 0, "Todos meus exames deram abaixo que será que eu tenho?", "c2f4"],
  ["v.cmpos_", 1, "Dr quais são os principais para se tomar ?", "201c"],
  ["nutriednaalves", 1, "Lembrando que se na fórmula se for colocado \"quelado\" na frente do@mineral não compete com outro mineral ou se", "201c"],
  ["deeh.ruiz", 0, "Qual idade começa? Tenho 40 anos e não sinto nada", "8e88"],
  ["maria_lu1236", 2, "Com que idade começa?", "5c34"],
  ["amaral__solange", 2, "Não tem nada bom???????? 🫠", "5c34"],
  ["monise_5513", 0, "Neutrofilos abaixo do valor de referencia o que é ?", "c2f4"],
  ["kakacarv_", 0, "Tive CA de mama positivo para o estrogênio. Não posso repor! O que devo fazer?", "8e88"],
  ["klify.oficial", 0, "Olá! A Klify é um sistema de gestão para clínicas que reúne agenda, atendimento no WhatsApp e Instagram, estoq", "b839"],
  ["deborabarrosterapeuta", 0, "Estrogenio puro pode sim. É diferente do hormônio de anticoncepcional", "8e88"],
  ["deborabarrosterapeuta", 0, "@danioliveira.terapeuta Estrogenio pode.", "8e88"],
  ["medicinadaalma_elsajesus", 0, "Tenho todos. Tem cura? O que fazer? Grata", "fe7c"],
  ["luanaflavia.personal", 0, "@deborarequiaoimoveis testosterona causou a trombose?? Oq usou??", "8e88"],
  ["fabricialima550", 0, "@sotianamesmo o que seria?", "fe7c"],
  ["andressamorena5670", 1, "@cleia.araujos nem toda mulher pode", "8e88"],
  ["josiane__anjos_", 1, "O que pode ser feito", "8e88"],
  ["marialararosa2", 0, "@silvaglaucialuciada eu quero orar pq só jesus me entende 😢😢😢", "6103"],
  ["marialararosa2", 0, "Cãibra no pé, quando tô deitada tentando dormir 😢😢😢😢 me ajuda meu Deus", "6103"],
  ["aleskamacedo", 0, "Ah não é possível 😂😂😂😂 já ?", "00f0"],
  ["lucia_vital", 0, "Eu hein...tah me monitorando?😂😂😂😂😂😂❤️🙌❤️🙌❤️🙌", "00f0"],
  ["leninha_silverio", 0, "Tenho pesquisado sobre a Hipermotilidade — trânsito intestinal acelerado Meu intestino só funciona normal quan", "c2f4"],
  ["blendakristen", 0, "Tenho inchaço ao redor dos olhos ao acordar há anos, e ultiamamente edema nas pernas. Meus exames estão totalm", "78a0"],
  ["deborarequiaoimoveis", 2, "É terrível, estou há 9 meses sem hormônios por conta de uma trombose. Fazendo exames e se Deus quiser pelo men", "8e88"],
  ["bianchi2746", 0, "@anapaulasouza1231 , depende de como esta seus exames hormonal femininos. Eu dei inicio porque comecei a senti", "830f"],
  ["anapaulasouza1231", 0, "@bianchi2746 com quantos anos começa a reposição?", "830f"],
  ["alinelinns", 0, "Feliz aniversário! Que Deus abençoe grandemente o seu novo ciclo, com muita alegria, assim como a que você lev", "5833"],
  ["tcdelfino", 7, "E quem tem endometriose, como faz pra suplementar essas faltas?", "8e88"],
  ["danioliveira.terapeuta", 5, "Não posso fazer reposição hormonal! E aí o que fazer?", "8e88"],
  ["soninhaefelipe", 0, "7 anos a primeira e com 40 anos a última. Se dependesse da minha vontade mestruaria até o meu último dia de vi", "6665"],
  ["keellyy25", 0, "Como repor?", "8e88"],
  ["raquelcosta6819", 0, "Qual o tratamento para isto?", "fe7c"],
  ["a_paulacampos_a", 2, "Pode ser renites, alergias respiratórias…", "c2f4"],
  ["_paulajussara", 0, "@elaine.amarorosa o exame é da enzima DAO . E pode fazer os IGE para ver sensibilidade a alguns alimentos.", "fe7c"],
  ["jaque_ramosl", 0, "O que fazer?", "8e88"],
  ["alinemariagarcia", 1, "Como repor??", "8e88"],
  ["luanaoliveira.14", 5, "E o que fazer???", "8e88"],
  ["flavia.lino.dermopigmentacao", 0, "Tenho 48 e já estou na menopausa há 3 anos. Sinto tudo isso. Não durmo, estou com osteopenia, tendinite nos do", "cb7f"],
  ["flavia.lino.dermopigmentacao", 0, "@deborawinter_ Sim. Inflação é a resposta de defesa do seu organismo contra algum tipo de agressão. Ex. Um cor", "c2f4"],
  ["milenaoliveira1558", 0, "Qual a dose que você tá tomando?", "bfef"],
  ["blendalara", 0, "E queda?", "c2f4"],
  ["susanarodriguezz91", 0, "Y hematocritos altos?", "c2f4"],
  ["francira_almeida", 0, "@150975smos eu tenho 56 e 5 meses e tenho 10 meses sem menstruar ou seja ainda não estou na menopausa, porque", "cb7f"],
  ["francira_almeida", 0, "@150975smos eu tenho 56 e 5 meses e tenho 10 meses sem menstruar ou seja ainda não estou na menopausa, porque", "cb7f"],
  ["geannevarao", 0, "Ou frescura, como já ouvi do pai do meu filho caçula", "2c33"],
]);

const sergio = C("sm", [
  ["", 0, "5? Vc foi econômico quase gabaritei😂"],
  ["", 1, "Quem me dera dormir 8 hrs ! 😳"],
  ["", 0, "Conheci o Serginho. Parabéns, você merece onde está hoje."],
  ["", 0, "Você é Luz! Não é @rayaniimmediato ?! ❤️❤️❤️"],
  ["", 0, "Olá! A Klify é uma plataforma completa de gestão para clínicas com agenda, WhatsApp, Instagram, atendimento, estoque, financeiro e vários outros módulos. Uma pergunta para você:"],
  ["", 0, "Essa Barbie da perimenopausa tá muito descabelada em qualquer ocasião. Que isso, doutor! Tb não é assim! A textura do cabelo muda mas a gente dá um jeito 😂"],
  ["", 0, "E a mama super dolorida ? Entra a lista ???"],
  ["", 0, "Serginho, vc é uma pessoa maravilhosa por dentro e por fora. Só quem tem compulsão sabe o tanto que é complexo."],
  ["", 1, "Dois queridos !😍"],
  ["", 0, "@cecilia.fleming26 parei de tomar antibiótico porque percebi que era a menopausa."],
  ["", 0, "Hoje só não emagrece quem não tem $ kkk"],
]);

const doctorCreator = C("dc", [
  ["dra.danielaporto.usg", 0, "As pessoas precisam entender que não tem como ser a mesma pessoa e fazer as mesmas coisas após ser mãe. Se não quer abrir mão?"],
  ["noemiaaires01", 0, "Será que persegue quem vota no LULA? 😂😂"],
  ["yohgenson", 0, "Porque não cria regras para proibir Formação massiva de médicos 😂😂😂"],
  ["psp.guimaraes", 0, "@doctorvipway pq?"],
  ["cacadominiquinifoto", 0, "Vcs poderiam fazer um carrossel sobre fotos e vídeos!"],
  ["drmelquideschamps", 0, "Todo médico tem que ter RQE de produto digital. Besteira ..pode tirar o rqe eu quero continuar vendendo digital mesmo"],
  ["saravargasdivulga", 0, "Esse povo do CFM não sabe nem quantos carácteres cabe na BIO do Insta. 😂😂😂"],
  ["dracarolineprim", 0, "Deixar com 7 segundos pelo próprio Instagram?"],
  ["raytchel.ia", 0, "📲 O anúncio trouxe o cliente. E depois?"],
  ["wyliagurgel", 0, "Pode expor e repostar vídeos de pessoas aleatorias do instagram e dizer que elas tem ou não tem determinado diagnóstico?"],
  ["klauslaurett", 0, "Será que serve para meu autismo e transtorno depressivo maior e ansiedade generalizada?"],
  ["btn_2026", 0, "CFM: Como posso atrapalhar a vida do Médico um pouco mais?"],
  ["doctorcreators", 0, "@thiagolvieira 😂😂😂 de meses? Semanas? 😂😂😂😂Pode adaptar"],
  ["dr.guilhermenery", 0, "Basicamente pode dizer “dr fulano ta de parabens” e só ne?! KKKKK😂"],
  ["henriquee_paiva", 0, "Faz agora dos convênios usando ia erroneamente pra barrar exames ?"],
  ["drigorpereira.med", 0, "@doctorcreators não vai?"],
  ["spadagikanutri", 0, "conhece o Alfredcode? Da uma pesquisada… me salva em tudo"],
]);

const mariela = C("mm", [
  ["", 0, "Pode usar o dermom genon no rosto e na área dos olhos?"],
  ["", 0, "Dra. Qual o valor de sua consulta on-line? E o contato?"],
  ["", 0, "O que usar qdo a pele ja esta irritada?"],
  ["", 0, "Pode indicar opções de hidratantes para usar nesse intervalo de 24h?"],
  ["", 0, "Qual o valor?"],
  ["", 0, "Tenho rosácea, posso usar a vitamina c?"],
  ["", 0, "Existe algum hidratante para dar uma ajuda? rs"],
  ["", 0, "Hidratante, poderia indicar algum?"],
  ["", 0, "Olá! Somos a Klify, uma plataforma de gestão para clínicas com módulos de agenda, WhatsApp, Instagram"],
  ["", 0, "O onde fica esti local"],
  ["", 0, "@cristiany_carvalhosf poderia me passar seu telefone com DDD para que a minha equipe entre em contato"],
  ["", 0, "Dr, qual ativo melhor neste caso? Thiamidol ou ácido tranexâmico?"],
  ["", 0, "Retinol somente à noite, né!?"],
  ["", 0, "Dificil encontrar medicas como vc dra. Parabens bom senso é tudo"],
  ["", 0, "Quanto antes, melhor! Minha musa inspiradora começou depois dos 50 e está belíssima"],
]);

// ---------- asserções pontuais ----------
let falhas = 0;
function espera(nome: string, ok: boolean, detalhe = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
}
const tri = (t: string, a: string | null = null, donos = ["drajulianapaola"]) => triarComentario(t, a, { donos });
const motivo = (t: string, a: string | null = null, donos?: string[]) => {
  const r = tri(t, a, donos);
  return r.ok ? "fica" : r.motivo;
};

console.log("=== Triagem: casos reais ===");
espera("só marcar amiga sai", motivo("@arianereisgodoi") === "so_mencao", motivo("@arianereisgodoi"));
espera("só emoji sai", motivo("😍😍😍") === "so_emoji");
espera("resposta do próprio perfil sai", motivo("Já me segue no QUERIDA DIVA? Ainda não te vi por lá", "drajulianapaola") === "do_proprio_perfil");
espera("propaganda de marca sai", motivo("A IZENLAB Nutrition é a mais nova marca de suplementação! Quer ser nosso parceiro? Siga @izen.lab", "izen.lab") === "spam_ou_promocao");
espera("app oferecido sai", motivo("@___hadassa com o Dona app voce conseque acompanhar as fases", "dona.app.br") === "spam_ou_promocao");
espera("outra médica (@dra.) sai", motivo("@cybele_mshi isso indica uma desregulação. É importante avaliar exames hormonais?", "dra.mesquitaroberta") === "profissional_de_saude");
espera("nutri no @ sai", motivo("E eu? 34 tbm kkkkkkkkk", "julia.ahrendsnutri") === "profissional_de_saude");
espera("\"sou nutricionista\" no texto sai", motivo("Sou nutricionista e indico sempre fazer exames antes, concorda?") === "profissional_de_saude");
espera("conversa entre seguidores sai", motivo("@mariaconceicaotinoco como é está análise?") === "conversa_entre_seguidores");
espera("pergunta para os outros seguidores sai", motivo("Alguém sente calafrios?") === "pergunta_para_seguidores");
espera("piada sai", motivo("Quer dizer que com 32 eu deveria estar no auge de coisa boa ? Ta errado isso ai kkkkkkkk") === "piada_ou_ironia");
espera("desabafo sem pergunta sai", motivo("Misericórdia 😭 porque temos que passar por tudo isso 😥") === "sem_pergunta");
espera("pergunta retórica sai", motivo("PQP tudo pra nós?") === "sem_pergunta");
espera("curta sem contexto sai", motivo("Faz musculação?") === "vazio_ou_curto");
espera("\"Qual valor?\" curto fica (comercial)", motivo("E qual valor ?") === "fica");
espera("\"Atende on-line?\" fica (comercial)", motivo("Atende on-line?") === "fica");
espera("\"valor de referência\" não é preço", classificarIntencao(normalizar("Neutrofilos abaixo do valor de referencia o que é ?")) !== "preco");
espera("dúvida real fica", motivo("E como trata Cortisol alto gente?? Faço academia, hidroterapia") === "fica");
espera("pergunta ao perfil marcando a médica fica", motivo("@drajulianapaola eu não posso fazer reposição hormonal, qual tratamento a senhora indica?") === "fica");
espera("pedido de preço vira intenção preço", classificarIntencao(normalizar("Tenho fissura. Pra fazer o laser qual valor?")) === "preco");
espera("convênio vira agendamento", classificarIntencao(normalizar("você atende convênio ?")) === "agendamento");
espera("\"dá câncer\" vira medo", classificarIntencao(normalizar("Reposição hormonal dá câncer? Tenho medo")) === "medo");
espera("\"não posso fazer reposição\" vira objeção", classificarIntencao(normalizar("eu não posso fazer reposição hormonal, qual tratamento indica?")) === "objecao");
espera("\"X ou Y?\" vira comparação", classificarIntencao(normalizar("Dr, qual ativo melhor neste caso? Thiamidol ou ácido tranexâmico?")) === "comparacao");

// ---------- antes e depois por cliente ----------
const clientes: [string, ComentarioBruto[], string[], boolean][] = [
  ["Dra. Juliana Paola", juliana, ["drajulianapaola"], true],
  ["Lana Torres (amostra 90 dias)", lana, ["dralanatorres"], true],
  ["Lana Torres (30 dias, 116 mais recentes)", lana30d, ["dralanatorres"], true],
  ["Dr. Sergio Maia", sergio, ["drsergiomaiajr"], true],
  ["Doctor Creator", doctorCreator, ["doctorcreators"], true],
  ["Mariela Muniz (dermato)", mariela, ["marielamunizdermato"], true],
];
let totalAntes = 0;
let totalDepois = 0;
for (const [nome, rows, donos, ign] of clientes) {
  const r = analisarVozDoPaciente(rows, { donos, ignorarProfissionais: ign });
  totalAntes += r.total;
  totalDepois += r.mantidos.length;
  console.log(`\n=== ${nome}: ${r.total} comentários marcados como pergunta -> ${r.mantidos.length} perguntas reais (${r.total - r.mantidos.length} fora) ===`);
  console.log("Motivos:", Object.entries(r.porMotivo).map(([m, n]) => `${ROTULO_MOTIVO[m as keyof typeof ROTULO_MOTIVO].titulo}: ${n}`).join(" | "));
  console.log("Exemplos que SAÍRAM:");
  for (const e of r.excluidos.slice(0, 8)) console.log(`  - [${e.motivo}] ${e.comentario.text.slice(0, 90)}`);
  console.log("Exemplos que FICARAM:");
  for (const m of r.mantidos.slice(0, 8)) console.log(`  + [${m.intencao}${m.assunto ? " · " + m.assunto.id : ""}${m.riscos.length ? " · " + m.riscos.join(",") : ""}] ${m.textoLimpo.slice(0, 90)}`);
  console.log(`Grupos (2+ pessoas): ${r.grupos.length} | cuidado médico: ${r.gruposCuidado.length} | avulsas: ${r.avulsas.length}`);
  for (const g of r.grupos.slice(0, 6)) {
    console.log(`  * ${g.rotulo} [${g.intencao}] ${g.pessoas} pessoas | conteúdo ${g.potencialConteudo} | urgência ${g.urgenciaComercial}`);
    console.log(`      resumo: ${g.resumo}`);
    console.log(`      exemplos: ${g.exemplos.map((e) => `${e.autor}: "${e.texto.slice(0, 60)}"`).join(" | ")}`);
    if (g.sugestaoPost) console.log(`      post: ${g.sugestaoPost.titulo} (${g.sugestaoPost.formato}) | gancho: ${g.sugestaoPost.gancho}`);
    console.log(`      resposta: ${g.sugestaoResposta.slice(0, 120)}...`);
    if (g.abordagemComercial) console.log(`      comercial: ${g.abordagemComercial.slice(0, 90)}...`);
    if (g.avisoCfm) console.log(`      CFM: ${g.avisoCfm.slice(0, 110)}`);
  }
  for (const g of r.gruposCuidado) console.log(`  ! ${g.rotulo} ${g.pessoas} pessoas | ex.: "${g.exemplos[0]?.texto.slice(0, 60)}"`);
  if (r.limitacoes.length) console.log("Limitações:", r.limitacoes.map((l) => l.texto).join(" || "));
}
console.log(`\nTOTAL: ${totalAntes} comentários marcados como pergunta -> ${totalDepois} perguntas reais.`);

// ---------- invariantes ----------
console.log("\n=== Invariantes ===");
const rj = analisarVozDoPaciente(juliana, { donos: ["drajulianapaola"] });
espera("nenhum grupo comum tem menos de 2 pessoas", rj.grupos.every((g) => g.pessoas >= 2));
espera("pedido de dose vira grupo de cuidado", rj.gruposCuidado.length > 0 && rj.gruposCuidado.every((g) => g.cuidadoMedico && g.sugestaoPost === null && !!g.avisoCfm));
espera("nenhum pedido de dose em grupo de post", rj.grupos.every((g) => !g.riscos.includes("automedicacao")));
espera("cortisol agrupado", rj.grupos.some((g) => g.id.startsWith("cortisol") && g.pessoas >= 3), rj.grupos.map((g) => `${g.id}:${g.pessoas}`).join(", "));
espera("preço vira grupo comercial com abordagem", rj.grupos.some((g) => g.intencao === "preco" && !!g.abordagemComercial && g.urgenciaComercial === "alta"));
espera("mesma pessoa repetindo conta uma vez", rj.excluidos.some((e) => e.motivo === "repetido" && e.comentario.author_username === "elaine.marcello"));
const textos = [...rj.grupos, ...rj.gruposCuidado].flatMap((g) => [g.sugestaoResposta, g.sugestaoPost?.gancho ?? "", ...g.exemplos.map((e) => e.texto + e.autor)]).join(" ");
espera("exemplos e respostas sem @ completo", !/@[a-z0-9_.]{3,}/i.test(textos));
espera("respostas sem promessa de resultado", !/(garant|100%|resultado certo|vai resolver|cura definitiva)/i.test(textos));
espera("respostas sem travessão", !/[—–]/.test(textos));

// ---------- ideias: só de grupos com 2+ pessoas e do que performou ----------
console.log("\n=== Ideias a partir das dúvidas (Juliana, sem posts) ===");
const ideias = buildIdeias([], juliana as any, { donos: ["drajulianapaola"] });
for (const i of ideias.ideias) {
  console.log(`- ${i.titulo} | ${i.formato} | objetivo ${i.objetivo} | confiança ${i.confianca}`);
  console.log(`    evidência: ${i.evidencia}`);
  console.log(`    gancho: ${i.gancho}`);
  console.log(`    roteiro: ${i.roteiro.join(" / ")}`);
  console.log(`    CTA: ${i.cta}${i.avisoSeguranca ? ` | AVISO: ${i.avisoSeguranca}` : ""}`);
}
espera("ideia de dúvida tem 2+ pessoas na evidência", ideias.ideias.filter((i) => i.regra === "pergunta").every((i) => /(\d+) pessoas/.test(i.evidencia) && Number(/(\d+) pessoas/.exec(i.evidencia)![1]) >= 2));
espera("ideia vira Insight da área ideias", ideias.ideias.every((i) => ideiaParaInsight(i).area === "ideias"));
espera("roteiro com 3 a 5 passos", ideias.ideias.every((i) => i.roteiro.length >= 3 && i.roteiro.length <= 5));
espera("nenhuma ideia de pedido de dose", ideias.ideias.every((i) => !/dose|dosagem/i.test(i.titulo)));
const so1 = buildIdeias([], C("x", [["ana", 0, "Como abaixar o cortisol??"], ["ana", 0, "Como abaixar o cortisol alto??"], ["", 0, "@fulana olha isso"], ["", 0, "kkkkk qual é?"]]) as any);
espera("comentário único/ruído não vira ideia", so1.ideias.length === 0, String(so1.ideias.length));

// ---------- detecção original (477eb43): a camada "Todas as perguntas detectadas" ----------
// Compara a função restaurada com o código do commit 477eb43 lido do repositório (não com uma cópia).
console.log(`\n=== Detecção original x código do ${BASELINE} ===`);
const base = await carregarBaseline();
const donosJ = ["drajulianapaola"];
// Fixture: os comentários reais acima + casos que a regra original trata (sorteio, convite, resposta do
// perfil, texto curto) + linhas sem is_question (a consulta original só lia is_question = true).
const extrasFixture = C("bx", [
  ["drajulianapaola", 0, "Obrigada pela pergunta! Vou responder no stories?"],
  ["", 0, "Já me segue no QUERIDA DIVA? Ainda não te vi por lá"],
  ["", 0, "Participe do sorteio e marque 3 amigas?"],
  ["", 0, "Oi?"],
  ["", 0, "kkkkk qual é?"],
  ["", 0, "Dra, qual exame pedir para ver o cortisol?"],
]);
type ComFlag = ComentarioBruto & { is_question?: boolean; like_count: number | null };
const fixtureOriginal: ComFlag[] = [
  ...[...juliana, ...lana, ...sergio, ...mariela, ...extrasFixture].map((c) => ({ ...c, like_count: c.like_count ?? null, is_question: true })),
  { id: "nq1", text: "Adorei o vídeo, muito bom mesmo", like_count: 0, author_username: "fulana", instagram_post_id: "p1", is_question: false },
  { id: "nq2", text: "Qual o valor da consulta", like_count: 0, author_username: "ciclana", instagram_post_id: "p1", is_question: false },
];
const esperadoBase = base.comentarios.filtrarPerguntas(fixtureOriginal.filter((c) => c.is_question === true), donosJ);
const obtido = perguntasDaDeteccaoOriginal(fixtureOriginal, donosJ);
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join(",");
espera(`detecção original devolve as mesmas perguntas que o ${BASELINE} (${esperadoBase.length} de ${fixtureOriginal.length})`, ids(obtido) === ids(esperadoBase), `${obtido.length} x ${esperadoBase.length}`);
espera("filtrarPerguntasOriginal = filtrarPerguntas do baseline", ids(filtrarPerguntasOriginal(fixtureOriginal, donosJ)) === ids(base.comentarios.filtrarPerguntas(fixtureOriginal, donosJ)));
espera(
  "categoriaDoComentario igual ao baseline em todos os comentários",
  fixtureOriginal.every((c) => categoriaDoComentario(c.text, c.author_username, donosJ) === base.comentarios.categoriaDoComentario(c.text, c.author_username, donosJ)),
);
espera("linhas sem is_question ficam fora (como na consulta original)", !obtido.some((c) => c.id === "nq1" || c.id === "nq2"));
espera("detecção original tira resposta do perfil, sorteio/convite e texto curto", !obtido.some((c) => ["bx0", "bx1", "bx2", "bx3"].includes(c.id)));
espera("detecção original mantém o que a triagem nova tira (ex.: piada)", obtido.some((c) => c.id === "bx4"));
const cOrig = computeDuvidasFrequentes(obtido, { threshold: 0.4, minSize: 2 });
const cBase = base.metrics.computeDuvidasFrequentes(esperadoBase, { threshold: 0.4, minSize: 2 });
const assinatura = (cs: { count: number; representative: { id: string }; items: { id: string }[] }[]) => cs.map((c) => `${c.count}|${c.representative.id}|${ids(c.items)}`).join(";");
espera(`computeDuvidasFrequentes (dúvidas mais repetidas) igual ao ${BASELINE}: ${cOrig.length} grupos`, assinatura(cOrig) === assinatura(cBase), `${cOrig.length} x ${cBase.length}`);
const comFlag = fixtureOriginal.filter((c) => c.is_question);
const triagem = filtrarPerguntasTriagem(comFlag, donosJ);
espera("filtrarPerguntas (Relatório/PDF) segue com a triagem nova", ids(filtrarPerguntas(comFlag, donosJ)) === ids(triagem));
espera("triagem nova é mais estrita que a detecção original", triagem.length < obtido.length, `${triagem.length} < ${obtido.length}`);
console.log(`  detecção original: ${obtido.length} perguntas; triagem nova: ${triagem.length}; grupos originais: ${cOrig.length}`);

// ---------- ideias: regra original de volta, sem repetir a nova ----------
console.log(`\n=== Ideias pela regra original x ${BASELINE} ===`);
const ideiasBase = base.conteudo.buildIdeias([], esperadoBase);
const ideiasOrig = buildIdeiasRegraOriginal([], obtido);
// Sem "acao": desde out/2026 a ação não traz mais "Gancho possível: <comentário copiado>" (pedido do usuário).
const chave = (i: any) => [i.regra, i.tema, i.formato, i.funil, i.estagio, i.porque].join(" | ");
// Desde out/2026 só comentário classificado como pergunta entra (classificar-comentario.ts): a regra original
// pode dar MENOS ideias que o baseline, nunca outras.
{
  const base = new Set(ideiasBase.ideias.map(chave));
  for (const i of ideiasOrig.ideias) if (!base.has(chave(i))) console.log("   nova:", chave(i));
  espera(
    `ideias "pergunta repetida": todas presentes no ${BASELINE} (${ideiasOrig.ideias.length} de ${ideiasBase.ideias.length})`,
    ideiasOrig.ideias.every((i) => base.has(chave(i))),
  );
}
espera("faltas da regra original iguais ao baseline", ideiasOrig.faltas.join("\n") === ideiasBase.faltas.join("\n"));
espera("ideias da regra original marcadas como regra original", ideiasOrig.ideias.every((i) => i.regraOriginal === true));
const novasJ = buildIdeias([], juliana as any, { donos: donosJ });
const origJ = buildIdeiasRegraOriginal([], perguntasDaDeteccaoOriginal(juliana as any[], donosJ));
const cruz = ideiasOriginaisSemRepetir(novasJ.ideias, origJ.ideias, analisarVozDoPaciente(juliana, { donos: donosJ }));
espera("deduplicação não perde nada (extras + repetidas = originais)", cruz.extras.length + cruz.repetidas.length === origJ.ideias.length, `${cruz.extras.length} + ${cruz.repetidas.length} = ${origJ.ideias.length}`);
const sobrepoe = (a: string[] = [], b: string[] = []) => a.length > 0 && b.length > 0 && a.filter((x) => b.includes(x)).length / Math.min(a.length, b.length) >= 0.5;
espera("nenhuma ideia extra repete os comentários de uma ideia nova", cruz.extras.every((o) => novasJ.ideias.every((n) => !sobrepoe(o.comentarioIds, n.comentarioIds))));
espera("toda repetida tem uma ideia nova com os mesmos comentários", cruz.repetidas.every((r) => sobrepoe(r.original.comentarioIds, r.nova.comentarioIds)));
for (const o of cruz.extras) console.log(`  + [regra original] ${o.titulo.slice(0, 70)} | ${o.formato} | ${o.funil} | ${o.estagio}`);
for (const r of cruz.repetidas) console.log(`  = [já na lista nova] ${r.original.titulo.slice(0, 60)} -> ${r.nova.titulo}`);
const txt = ideiaParaTexto(novasJ.ideias[0]);
espera("texto copiado traz Funil e Estágio", /\nFunil: /.test(txt) && /\nEstágio: /.test(txt), txt.split("\n").slice(0, 5).join(" / "));
espera("texto copiado mantém gancho, roteiro e CTA", /\nGancho: /.test(txt) && /\nRoteiro:/.test(txt) && /\nCTA: /.test(txt));
espera("todas as ideias novas têm funil e estágio", novasJ.ideias.every((i) => !!i.funil && !!i.estagio));

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
if (falhas) process.exitCode = 1;
