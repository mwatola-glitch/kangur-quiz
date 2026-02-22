
function getExt(filename)
{
    var ext = filename.split('.').pop();
    if(ext == filename) return "";
    return ext;
}

var Base64 = function(input) {
    var StringMaker = undefined;
    if(navigator.userAgent.toLowerCase().indexOf(" chrome/")>=0||navigator.userAgent.toLowerCase().indexOf(" firefox/")>=0||
    navigator.userAgent.toLowerCase().indexOf(' gecko/')>=0){StringMaker=function(){this.str="";this.length=0;
    this.append=function(s){this.str+=s;this.length+=s.length;};this.prepend=function(s){this.str=s+this.str;this.length+=s.length;};
    this.toString=function(){return this.str;}}}else{StringMaker=function(){this.parts=[];this.length=0;this.append=function(s){
    this.parts.push(s);this.length+=s.length;};this.prepend=function(s){this.parts.unshift(s);this.length+=s.length;};
    this.toString=function(){return this.parts.join('');}}}
    var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o=new StringMaker(),a,b,c,d,f,g,h,i=0;while(i<input.length){a=input[i++];
    b=input[i++];c=input[i++];d=a>>2;f=((a&3)<<4)|(b>>4);g=((b&15)<<2)|(c>>6);h=c&63;
    if(isNaN(b)){g=h=64;}else if(isNaN(c)){h=64;}o.append(keyStr.charAt(d)+keyStr.charAt(f)+keyStr.charAt(g)
    +keyStr.charAt(h));}return o.toString();
};

var Base64D = {
    // private property
    _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
    // public method for encoding
    
    // public method for decoding
    decode : function (input) {
        var output = "";
        var chr1, chr2, chr3;
        var enc1, enc2, enc3, enc4;
        var i = 0;
        input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
        while (i < input.length) {
            enc1 = this._keyStr.indexOf(input.charAt(i++));
            enc2 = this._keyStr.indexOf(input.charAt(i++));
            enc3 = this._keyStr.indexOf(input.charAt(i++));
            enc4 = this._keyStr.indexOf(input.charAt(i++));
            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;
            output = output + String.fromCharCode(chr1);
            if (enc3 != 64) {
                output = output + String.fromCharCode(chr2);
            }
            if (enc4 != 64) {
                output = output + String.fromCharCode(chr3);
            }
        }
        output = Base64D._utf8_decode(output);
        return output;
    },
       // private method for UTF-8 decoding
    _utf8_decode : function (utftext) {
        var string = "";
        var i = 0;
        var c = c1 = c2 = 0;
        while ( i < utftext.length ) {
            c = utftext.charCodeAt(i);
            if (c < 128) {
                string += String.fromCharCode(c);
                i++;
            }
            else if((c > 191) && (c < 224)) {
                c2 = utftext.charCodeAt(i+1);
                string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                i += 2;
            }
            else {
                c2 = utftext.charCodeAt(i+1);
                c3 = utftext.charCodeAt(i+2);
                string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                i += 3;
            }
        }
        return string;
    }
};

var zadania={
	category:null,
	yest:null,
	contest: null,
	Z:null,
	Y:null,
	t:null,
	
	loadAjax:function(url, dane, re){
		$.ajax({
			url:UF+"tests/"+url,
			data:dane,
			method:"post",
			success:function(msg){
				if (re!==undefined)
					re(msg);
			},
			error:function(msg){
				alert("Wystąpił błąd"+msg);
			}
		});
	},	
	start:function(){
		this.cleanView();
		this.category=null;
		this.year=null;
		this.contest=null;
		this.Z=null;
		this.Y=null;
		this.loadAvCategories();
		zadania.rebuildBC();
	},
	cleanView:function(){
		$("#testpage_container > div").hide();
		//
		if (zadania.t!=null){
			window.clearInterval(zadania.t);
		}
	},
	loadAvCategories:function(){
		this.loadAjax("load_categories",null,zadania.reLoadAvCategories);			
	},
	reLoadAvCategories:function(msg){
		var d=JSON.parse(msg);
		$("#category_list").html("");
		var x="";
		var t="<div class='col-md-3 col-xs-10 col-xs-offset-1 vspacer'><button onclick='zadania.loadCategory(#{id})' class='btn btn-block btn-default'><img class='img-responsive' src='res/img/#{sname}_testy.png'><br /><span style='#{sdays}'>Dostęp na #{days} dni<br /><br /></span><span style='#{sto}'>Aktywny do<br />#{valid_to}</span><span style='#{trial}'>Dostęp darmowy<br /><br /></span></button></div>";
		var l=[];		
		for (nr in d){
			var wpis=d[nr];
			wpis.sdays="display: none";
			wpis.sto="display: none";
			wpis.trial="display: none";
			l.push(wpis.name);
			if (wpis.demo==1){
				wpis.trial="";	
			}else if (wpis.valid_to!==null){
				wpis.sto="";
			}else{
				wpis.sdays="";
			}
			$("#category_list").append($.tmpl(t, wpis));
			
		}
		$("#testlist").html(l.join(", "));
		$("#category_selector").show('fade');
	},
	
	loadCategory:function(id){
		var d={
			cat_id:id
		};
		this.cleanView();
		this.loadAjax("load_category",d,zadania.reLoadCategory);
		
	},
	reLoadCategory:function(msg){
		var d=JSON.parse(msg);
		if (d.ad==true){
			zadania.start();
		}
		zadania.category={id:d.id, name:d.name};
		zadania.year=null;
		zadania.contest=null;
		zadania.rebuildBC();
		$("#year_list").html("");
		var t="<div class='col-md-1 col-xs-3 vspacer'><button onclick='zadania.loadYear(#{id})' class='btn btn-primary'>#{year}</button></div>";
		for (nr in d.years){
		
			var wpis=d.years[nr];
			wpis.year=parseInt(wpis.year);
			if (wpis.year<10) wpis.year="000"+wpis.year;
			else if (wpis.year<100) wpis.year="00"+wpis.year;
			else if (wpis.year<1000) wpis.year="0"+wpis.year;
			
			$("#year_list").append($.tmpl(t, wpis));
		}
		$("#year_selector").show('fade');
		$("#current_category").html(d.name);
	},
	rebuildBC:function(){
		$(".bc_extra").remove();
		if (zadania.category!=null){
			$("#bc").append($.tmpl("<li class='bc_extra'><a  href='javascript:void(0)' onClick='zadania.loadCategory(#{id})'>#{name}</a></li>",zadania.category));
		}else return;
		
		if (zadania.year!=null){
			var y=[];
			y.year=zadania.year.year;
			y.year=parseInt(y.year);
			y.id=zadania.year.id;
			if (y.year<10) y.year="000"+y.year;
			else if (y.year<100) y.year="00"+y.year;
			else if (y.year<1000) y.year="0"+y.year;
			
			$("#bc").append($.tmpl("<li class='bc_extra'><a  href='javascript:void(0)' onClick='zadania.loadYear(#{id})'>#{year}</a></li>",y));
		}else return;
		if (zadania.contest!=null){
			$("#bc").append($.tmpl("<li class='bc_extra'><a  href='javascript:void(0)' >#{typ}</a></li>",zadania.contest));
		}
				
	},
	loadYear:function(yid){
		var d={
			cat_id:zadania.category.id,
			year_id:yid
		};
		
		
		this.cleanView();
		this.loadAjax("load_year",d,zadania.reLoadYear);
	},
	reLoadYear:function(msg){
		var d=JSON.parse(msg);
		if (d.ad==true){
			zadania.start();		
			return;	
		}
		d.year=parseInt(d.year);
		zadania.year={id:d.id, year:d.year};
		
		if (d.year<10) d.year="000"+d.year;
			else if (d.year<100) d.year="00"+wpis.year;
			else if (d.year<1000) d.year="0"+wpis.year;
		zadania.contest=null;
		zadania.rebuildBC();
		$("#type_selector").show('fade');
		$("#current_year").html(zadania.category.name+" "+d.year);
	},
	startPractice:function(){
		var d={
			cat_id:zadania.category.id,
			year_id:zadania.year.id,
			contest:0
		};
		this.cleanView();
		this.loadAjax("start_contest",d,zadania.reLoadContest);
	},
	startContest:function(){
		$("#loading_progress").css("width",0);
		var d={
			cat_id:zadania.category.id,
			year_id:zadania.year.id,
			contest:1
		};
		
		this.cleanView();
		this.loadAjax("start_contest",d,zadania.reLoadContest);
	},
	reLoadContest:function(msg){
		var d=JSON.parse(msg);
		if (d.ad==true){
			zadania.start();			
		}
		
		zadania.contest={
			c_id:zadania.category.id,
			y_id:zadania.year.id,
			info: d.info
		};
		
		zadania.contest.info.noquestion_1=parseInt(zadania.contest.info.noquestion_1);
		zadania.contest.info.noquestion_2=parseInt(zadania.contest.info.noquestion_2);
		zadania.contest.info.noquestion_3=parseInt(zadania.contest.info.noquestion_3);
		
		if (d.type==0){
			zadania.contest.typ="trening";	
		}else
			zadania.contest.typ="konkurs";
		zadania.contest.ityp=d.type;
		
		zadania.rebuildBC();
		
		//TUTAJ bez fade
		$("#contest_wait").show();
		
		$("#loading_progress").css("width",0);
		globalny_start_progres=0;
		globalny_etap_progres=100;
		globalny_id_progres="#loading_progress";

		this.Z=null;
		this.Y=null;
		
		if (d.type==0){
			globalny_etap_progres=50;	
		}
		//FIXME: obsługa błędów
		JSZipUtils.getBinaryContent('data/'+zadania.contest.info.y+'.zip', function(err, data) {
			zadania.Y=data;
			
			if (zadania.contest.ityp==1) zadania.preBeginContest();
			else{
				globalny_start_progres=50;
				JSZipUtils.getBinaryContent('data/'+zadania.contest.info.z+'.zip', function(err, data) {
					zadania.Z=data;
					zadania.preBeginContest();		
					
				});
				
			}
		});
	},
	preBeginContest:function(){
		//FIXME: obsługa błędów
		JSZip.loadAsync(zadania.Y).then(function (ZC){
			zadania.ZC=ZC;
			if (zadania.Z!=null){
					JSZip.loadAsync(zadania.Z).then(function (ZC){
					zadania.ZZ=ZC;
						setTimeout(function (){
							zadania.beginContest();
						},150);		
				});	
			}else{
				setTimeout(function (){
					zadania.beginContest();
				},150);		
			}
		});
		
		
	},
	beginContest:function(){
		this.cleanView();
		$("#nrofq").html('1');
		$("#qimg").hide();
		$("#qmath").hide();
		$("#qmath").html("");
		
		$("#qimg").attr("src","data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
		$("#answers").html("");
		$("#contest").show('fade');
		var i;
		$("#navigation").html("");
		$("#trial").hide();
		$("#finish_trial").hide();
		
		$("#trialA").hide();
		$("#trialA span").html("");
		$("#trialB").hide();
		$("#trialB img").attr("src","data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
		
		$("#finish").hide();
		$("#timer").hide();
		
		var t="<div class='col-xs-2'><span class='question_navigation #{cl}' onclick='zadania.showQuestion(#{nr})'>#{nr}</span><span class='question_navigation_next glyphicon glyphicon-none' odp='#{nr}'></span></div>";
		
		zadania.answers=[];
		zadania.answersR=[];
		zadania.answersS=[];
		
		var html="";
		for (i=0;i<this.contest.info.count;i++){
			if(i%5==0) html+="<div class='row centered'><div class='col-xs-1'>&nbsp;</div>";
			var d={
				nr:i+1
				
			};
			
			if (i<this.contest.info.noquestion_1) { d.cl='btn-success';}else
			if (i<(this.contest.info.noquestion_1+this.contest.info.noquestion_2)) { d.cl='btn-warning';}else
			d.cl='btn-danger';
									
			html+=$.tmpl(t,d);
			if(i%5==4) html+="</div>";
		
			zadania.answers[i]=-1;
			zadania.answersR[i]=0;
			zadania.answersS[i]=false;
		}
		$("#navigation").append(html);
		
			
		
		if (zadania.contest.ityp==1){
			var x=new Date();
			zadania.ts=x.getTime();
			zadania.t= window.setInterval(zadania.tick,250);			
			
			$("#finish").show();
			$("#timer").show();
		}else{
			$("#finish_trial").show();
		}
		
		
		zadania.loadAjax("contest_started",[]);
		this.showQuestion(1);
		
	},
	selectedAnswer:function(nr){
		var i=zadania.act_question-1;
		if (zadania.answers[i]==nr) return;
		if (zadania.answersR[zadania.act_question-1]!=0)
			return;
		
		zadania.answers[i]=nr;
		$(".question_navigation_next[odp='"+zadania.act_question+"']").removeClass("glyphicon-none icomoon-sad icomoon-danger icomoon-happy icomoon-success icomoon-question icomoon-default");
		 
		$(".question_navigation_next[odp='"+zadania.act_question+"']").addClass("icomoon-question icomoon-default");
		zadania.answers[i]=nr;
		zadania.answersR[i]=0;
		
		$(".ans_label").removeClass("btn-info btn-danger btn-success");
		$(".ans_label[odp='"+nr+"']").addClass("btn-info");
		
		if (zadania.contest.ityp==0){
			$("#trial").show();
			$("#trialA").hide();
			$("#trialB").hide();
		}else{
			var d={
				nr:i,
				ans:nr
			};
			
			zadania.loadAjax("update_score",d,zadania.updatescoreRe);
		}
				
	},
	showQuestion:function(nr){
		var i;
		$("#nrofq").html(nr);
		zadania.act_question=nr;
		
		if (nr==1){
			$("#test_prev").prop("disabled","true");
		}else{
			$("#test_prev").prop("disabled","");
		}
		if (nr==zadania.contest.info.count){
			$("#test_next").prop("disabled","true");
		}else{
			$("#test_next").prop("disabled","");
		}
		
		$("#qimg").hide();
		$("#qmath").hide();
		$("#qmath").html("");
		$("#qimg").attr("src","data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
		$("#answers").html("");
		$("#answers").hide();
		
		$("#trial").hide();
		
		$("#trialA").hide();
		$("#trialA span").html("");
		$("#trialB").hide();
		$("#trialB img").attr("src","data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
		$("#qmath_ans").html("");
		
		var zad=zadania.contest.info.c[nr];
		if (zad.T=='F'){
			zadania.ZC.file(zad.D).async("uint8array").then(function (data){
			$("#qimg").attr("src","data:image/"+getExt(zad.D)+";base64,"+Base64(data));
			});
		}else{
			
			$("#qmath").html(Base64D.decode(zad.D));
			$("#qmath").show('fade');
		}
		//FIXME: poprwaic
		var A=['A','B','C','D','E','F','G'];
		var t="<div class='col-xs-2 ans_selectable' onclick='zadania.selectedAnswer(#{i})'><span class='ans_label' odp='#{i}'>#{nr}</span><img id='oimg#{nr}' class='img_el'/><span id='omath#{nr}'>#{math}</span></div>";
		$("#answers").append("<div class='col-xs-1'>&nbsp;</div>");
		for (i in zad.O){
			var O=zad.O[i];
			var d={
				nr:A[i],
				i:i,
				math:""
			};
			if (O.T!='F'){
				d.math=Base64D.decode(O.D);
				
			}
			$("#answers").append($.tmpl(t,d));
		}
		
		if (zadania.answers[nr-1]>=0){
			var cl="btn-info";
			if (zadania.answersR[nr-1]<0){
				cl='btn-danger';
			}
			if (zadania.answersR[nr-1]>0){
				cl='btn-success';
			}
			$(".ans_label[odp='"+zadania.answers[nr-1]+"']").addClass(cl);
		}
		
		zadania.astack=[];
		for (i in zad.O){
			var O=zad.O[i];
			if (O.T=='F')
			{
				zadania.astack.push({f:O.D, c:A[i]});
			}
			
		}
		zadania.asyncAnswers();
		
		//
		
		
			
	},
	
	asyncAnswers:function(){
		if (zadania.astack.length==0){
			$("#answers").show('fade');
			$("#qimg").show('fade');
			if (zadania.contest.ityp==0){
				
				if (zadania.answers[zadania.act_question-1]>=0){
					$("#trial").show();
				}
				
				
				MathJax.Hub.Queue(["Typeset",MathJax.Hub]);
			}
			zadania.loadAjax("heart_beat",[],zadania.updatescoreRe);
		}else{
			
			zadania.ZC.file(zadania.astack[0].f).async("uint8array").then(function (data){
				$("#oimg"+zadania.astack[0].c).attr("src","data:image/"+getExt(zadania.astack[0].f)+";base64,"+Base64(data));
				zadania.astack.shift();
				zadania.asyncAnswers();
			 	
			});
		}	
	},
	
	prevQuestion:function(){
		if (zadania.act_question>1) this.act_question--;
		zadania.showQuestion(this.act_question);	
	},
	nextQuestion:function(){
		if (zadania.act_question<zadania.contest.info.count) this.act_question++;
		zadania.showQuestion(this.act_question);
		
	},
	checkAnswer:function(){
		if (zadania.contest.ityp!=0){
			return;
		}
		if (zadania.answers[zadania.act_question-1]<0){
			return;
		}
		$("#trial").hide();
		//FIXME: poprwaic
		var A=['A','B','C','D','E','F','G'];
		var shift=0xAA+zadania.act_question-1;
		

		$(".question_navigation_next[odp='"+zadania.act_question+"']").removeClass("glyphicon-none icomoon-sad icomoon-danger icomoon-happy icomoon-success icomoon-question icomoon-default");
		

		if (zadania.answers[zadania.act_question-1]==(zadania.contest.info.c.R[zadania.act_question-1]^shift)){
			$("#trialA span").html("Odpowiedź prawidłowa <span class='icomoon-happy icomoon-success'></span>");
			zadania.answersR[zadania.act_question-1]=1;	
			$(".ans_label[odp='"+zadania.answers[zadania.act_question-1]+"']").removeClass("btn-info");
			$(".ans_label[odp='"+zadania.answers[zadania.act_question-1]+"']").addClass("btn-success");
			$(".question_navigation_next[odp='"+zadania.act_question+"']").addClass("icomoon-happy icomoon-success");
		}else{
			$("#trialA span").html("Poprawna odpowiedź to: "+A[(zadania.contest.info.c.R[zadania.act_question-1]^shift)]+"  <span class='icomoon-sad icomoon-danger'></span>");
			$(".ans_label[odp='"+(zadania.contest.info.c.R[zadania.act_question-1]^shift)+"']").addClass("btn-success");
			$(".question_navigation_next[odp='"+zadania.act_question+"']").addClass("icomoon-sad icomoon-danger");
			zadania.answersR[zadania.act_question-1]=-1;
		}
		$("#trialA").show('fade');
		
		if (zadania.answersS[zadania.act_question-1]==false){
			var d={
					nr:zadania.act_question-1,
					ans:zadania.answers[zadania.act_question-1]
				};
			
			zadania.loadAjax("update_score",d,zadania.updatescoreRe);
			zadania.answersS[zadania.act_question-1]=true;
		}
	},
	showDescription:function(){
		/*
		 * zadania.ZC.file(zad.D).async("uint8array").then(function (data){
			$("#qimg").attr("src","data:image/"+getExt(zad.D)+";base64,"+Base64(data));
			});
		 */
		var X=zadania.contest.info.c.CA[zadania.act_question-1];
		
		if (X.T=='F'){
			zadania.ZZ.file(X.D).async("uint8array").then(function (data){
			$("#trialB img").attr("src","data:image/"+getExt(X.D)+";base64,"+Base64(data));
			$("#trialB").show('fade');
			});
		}else{
			$("#trialB img").attr("src","data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
			$("#qmath_ans").html(Base64D.decode(X.D));
			MathJax.Hub.Queue(["Typeset",MathJax.Hub]);
			$("#trialB").show('fade');
		}
		
	},
	tick:function(){
		var x= new Date();
		var el=x.getTime()-zadania.ts;
		//var y=zadania.contest.info.tl*60*1000;
		var y=75*60*1000;
		if (el>y){
			zadania.finishContest();
		}
		var t=Math.floor((y-el)/1000);
		
		var m=Math.floor(t/60);
		var s=t%60;
		if (s<10) s="0"+s;
		$("#timer_value").html(m+":"+s);
		 
	},
	finishTrial:function(){
		zadania.start();
	},
	finishContest:function(){
		zadania.cleanView();
		zadania.loadAjax("load_result",[], zadania.finishContestRe);
	},
	updatescoreRe:function(msg){
		var dd=JSON.parse(msg);
		if (dd.tout==true){
			zadania.finishContest();
		}
		
		
	},
	finishContestRe:function(msg){
		var dd=JSON.parse(msg);
		$("#score").html(dd.score);
		$("#answers_result").html("");

		var t="<div class='col-xs-2'><span class='question_navigation  #{cl}' style='cursor: default'>#{nr}</span><span class='question_navigation_next glyphicon glyphicon-none' odp='#{nr}' style='cursor: default'></span></div>";
		//JAYMZ $("#navigation").append("<div class='col-xs-1'>&nbsp;</div>");

		var i;
		
		
		
		for (i=0;i<zadania.contest.info.count;i++){
			var d={
				nr:i+1,
				cl:"btn-default"
				
			};
			
			if (dd.o[i]==1) d.cl='btn-success';
			if (dd.o[i]==-1) d.cl='btn-danger';
			if (i==zadania.contest.info.noquestion_1) {$("#answers_result").append("<br style='clear: both'/>");}else
			if (i==(zadania.contest.info.noquestion_1+zadania.contest.info.noquestion_2)) { $("#answers_result").append("<br style='clear: both'/>");}
			$("#answers_result").append($.tmpl(t,d));
			
		}
		
		$("#contest_result").show('fade');
		
	}
	
	
};
