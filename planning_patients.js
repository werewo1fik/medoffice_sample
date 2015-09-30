var params = {};
var ColumnToTime = {};
var TimeToColumn = {};
var patientsData = null;
var tableData = {};
var mouseData = {};
var viewParams = {
  "headRectHeight":20,
  "rowHeight":50,
  "rectWidth":150,
  "rectHeight":50,
  "rectAsgmntWidth":100,
  "rectAsgmntHeight":50,
  "rectDraggedWidth":130,
  "rectDraggedHeight":70
};
var synchronized = true;
var movingRect = {};
var currentPatient = 0;
var animatorTimers = {};
var Animators = {};
var usingMdsKeys = [];
// массив ключей записей nazntime, которые открепили от таблицы 
// им нужно будет удалить предварительную запись (возможно, что всю услугу, если таковая есть)
var unattachedKeys = {};

var RectsData = {}; // данные о прямоугольниках, которые будут доступны пользователю для размещения
var TablesRectsData = {};
var Labels = {};
var baseRects = [];
var patientTablesRects = {};
var prerecordData = {};
var patientsTitleRects = {};

var Colors = {
  "patient_highlight":o_Sys.MakeColor(255,207,178),
  "patient_time_highlight":o_Sys.MakeColor(255,178,178),
  "slightly_red":o_Sys.MakeColor(255,211,211),
  "slightly_gray":o_Sys.MakeColor(230,230,230),
  "slightly_green":o_Sys.MakeColor(211,255,211),
  "dragged_green":o_Sys.MakeColor(190,255,190),
  "table_head":o_Sys.MakeColor(200,200,200),
  "black":o_Sys.MakeColor(0,0,0),
  "white":o_Sys.MakeColor(255,255,255)
};

function GetDefaultMovingRect(){
  return {
    "itemID":0,
    "xLeftTopPos":0,
    "yLeftTopPos":0,
    "width":0,
    "height":0,
    "deltaX":0,
    "deltaY":0,
    "dragable":false
  };
}

function onFormLoadData(){
  Form.ExecCmd("mouse_hook","",1);
  Form.ExecCmd("mouse_drag_scroll","",0);
  o_Sys.Randomize();
  initParams();
  updateDate();
  CreateAsgmntsRects(0);
}

function onFormShow(){
  if(!checkParams()){
    lib.warn("Укажите параметры планирования");
    return;
  }
  var ParentRect = Form.GetItemCode("AsgmntsRect");
  FormItem.SetItemLong(ParentRect,"H",viewParams.rectAsgmntHeight+5);
  FormItem.SetItemLong(ParentRect,"visible",1);
  FormItem.SetItemLong(ParentRect,"rectBkFillColor",Colors.slightly_gray);
  FormItem.SetItemLong(ParentRect,"rectBorderColor",Colors.black);
  FormItem.SetItemLong(ParentRect,"rectViewStyle",(0x0050|0x0100|0x0400));
  updateAll();
}

function initParams(){
  var servparams = modules.GetModule("json").Load("users\\all\\interfaces\\planning_patients\\params.json",true/*serverpath*/);
  params.date_start = o_Sys.GetCurrentDate(); // Сегодня
  params.date_end = o_Sys.GetCurrentDate(); // Сегодня
  for(var i in servparams)
    params[i] = servparams[i];
}

function checkParams(){
  if(!lib.IsTime(params.time_start) || !lib.IsTime(params.time_end)) return false;
  if(!params.kvant || params.kvant<=0) return false;
  if(lib.IsNull(params.naznType) || params.naznType<0) return false;
  return true;
}

function generateColumns(){
  // колонок должно быть столько, чтобы они влезли в 
  var Result = [
    {"name":"pat_fio",         "title":"ПАЦИЕНТ",    "width":100,"align":"left","params":"+dblclk;+fmttext;"}
  ];
  for(var d=params.date_start;d<=params.date_end;d=o_Sys.ModifyDate(d,1,1)){
    var kvantIndex = 1;
    for(var time = params.time_start;time<=params.time_end;time=addKvant(time),kvantIndex++){
      var Title = lib.TimeFmt(time);
      var StringIndex = ("kvant"+d+kvantIndex);
      ColumnToTime[StringIndex] = time; // составляем список
      TimeToColumn[String(time)] = StringIndex;
      var Column = {"name":StringIndex,"title":Title,"time":time};
      Result.push(Column);
    }
  }
  return Result;
}

function addKvant(currentTime){
  var addSeconds = params.kvant*60;
  return o_Sys.ModifyTime(currentTime,addSeconds,1);
}

function updateData(){
  try{
    unattachedKeys = [];
    lib.PBShow("Получение данных пациентов");
    lib.PBSetPos(0);
    lib.PBSetMaxPos(1);
    var sSQL = "select t2.srcid, /*v0*/ \n"+
    " mdgroup_patient_link, /*v1*/ \n"+
    " pat_fio, /*v2*/ \n"+
    " pat_sex, /*v3*/ \n"+
    " pat_birth, /*v4*/ \n"+
    " nazn_element_title, /*v5*/ \n"+
    " mdt1.srcid, /*v6*/ \n"+
    " md_time_zakaz, /*v7*/ \n"+
    " naznmd_md_link, /*v8*/"+
    " md_week_tmtbl_link, /*v9*/ \n"+
    " md_doc_tmtbl_link, /*v10*/ \n"+
    " md_sdoc_link, /*v11*/ \n"+
    " md_kcab_link /*v12*/ \n"+
    " FROM (select srcid,fval as nazntime_date from "+lib.getVDBTableNameByFieldName('nazntime_date')+" where (fld="+lib.GetFldCode('nazntime_date')+" and fval BETWEEN "+params.date_start+" AND "+params.date_end+")) as t2 left join \n"+
    " (select srcid,fval as nazntime_nazn_link from "+lib.getVDBTableNameByFieldName('nazntime_nazn_link')+" where (fld="+lib.GetFldCode('nazntime_nazn_link')+")) as t81 "+  
    "     on (t2.srcid=t81.srcid) left join \n"+  
    " (select srcid,fval as naznmd_template_link from "+lib.getVDBTableNameByFieldName('naznmd_template_link')+" where (fld="+lib.GetFldCode('naznmd_template_link')+")) as at2 "+
    "     on (nazntime_nazn_link=naznmd_template_link) left join \n"+
    " (select srcid,fval as naznmd_md_link from "+lib.getVDBTableNameByFieldName('naznmd_md_link')+" where (fld="+lib.GetFldCode('naznmd_md_link')+")) as at1 "+
    "     on (at2.srcid=at1.srcid) left join \n"+
    " (select srcid,fval as nazn_element_cat from "+lib.getVDBTableNameByFieldName('nazn_element_cat')+" where (fld="+lib.GetFldCode('nazn_element_cat')+")) as t8 "+  
    "     on (nazntime_nazn_link=t8.srcid) left join \n"+  
    " (select srcid,fval as nazn_element_link from "+lib.getVDBTableNameByFieldName('nazn_element_link')+" where (fld="+lib.GetFldCode('nazn_element_link')+")) as t10 "+
    "     on (nazntime_nazn_link=t10.srcid) left join \n"+
    " (select srcid,fval as mdgroup_patient_link from "+lib.getVDBTableNameByFieldName('mdgroup_patient_link')+" where (fld="+lib.GetFldCode('mdgroup_patient_link')+")) as t11 "+
    "     on (nazn_element_link=t11.srcid) left join \n"+
    " (select srcid,fval as pat_fio from "+lib.getVDBTableNameByFieldName('pat_fio')+" where (fld="+lib.GetFldCode('pat_fio')+")) as pt10 "+
    "     on (mdgroup_patient_link=pt10.srcid) left join \n"+
    " (select srcid,fval as pat_sex from "+lib.getVDBTableNameByFieldName('pat_sex')+" where (fld="+lib.GetFldCode('pat_sex')+")) as pt11 "+
    "     on (mdgroup_patient_link=pt11.srcid) left join \n"+
    " (select srcid,fval as pat_birth from "+lib.getVDBTableNameByFieldName('pat_birth')+" where (fld="+lib.GetFldCode('pat_birth')+")) as pt12 "+
    "     on (mdgroup_patient_link=pt12.srcid) left join \n"+
    " (select srcid,fval as nazn_element_title from "+lib.getVDBTableNameByFieldName('nazn_element_title')+" where (fld="+lib.GetFldCode('nazn_element_title')+")) as t16 "+
    "     on (nazntime_nazn_link=t16.srcid) left join \n"+
    " (select srcid,fval as nazn_element_date_cancel from "+lib.getVDBTableNameByFieldName('nazn_element_date_cancel')+" where (fld="+lib.GetFldCode('nazn_element_date_cancel')+")) as t18 "+
    "     on (nazntime_nazn_link=t18.srcid) left join \n"+
    " (select srcid,fval as md_nazn_link from "+lib.getVDBTableNameByFieldName('md_nazn_link')+" where (fld="+lib.GetFldCode('md_nazn_link')+")) as mdt1 "+
    "     on (t2.srcid=md_nazn_link) left join \n"+
    " (select srcid,fval as md_time_zakaz from "+lib.getVDBTableNameByFieldName('md_time_zakaz')+" where (fld="+lib.GetFldCode('md_time_zakaz')+")) as mdt3 "+
    "     on (mdt1.srcid=mdt3.srcid) left join \n"+
    " (select srcid,fval as md_sdoc_link from "+lib.getVDBTableNameByFieldName('md_sdoc_link')+" where (fld="+lib.GetFldCode('md_sdoc_link')+")) as mdt2 "+
    "     on (mdt1.srcid=mdt2.srcid) left join \n"+
    " (select srcid,fval as md_kcab_link from "+lib.getVDBTableNameByFieldName('md_kcab_link')+" where (fld="+lib.GetFldCode('md_kcab_link')+")) as mdt21 "+
    "     on (mdt1.srcid=mdt21.srcid) left join \n"+
    " (select srcid,fval as md_week_tmtbl_link from "+lib.getVDBTableNameByFieldName('md_week_tmtbl_link')+" where (fld="+lib.GetFldCode('md_week_tmtbl_link')+")) as mdt4 "+
    "     on (mdt1.srcid=mdt4.srcid) left join \n"+
    " (select srcid,fval as md_doc_tmtbl_link from "+lib.getVDBTableNameByFieldName('md_doc_tmtbl_link')+" where (fld="+lib.GetFldCode('md_doc_tmtbl_link')+")) as mdt5 "+
    "     on (mdt1.srcid=mdt5.srcid) \n"+
    " WHERE nazn_element_cat="+params.naznType+" AND nazn_element_date_cancel IS NULL";

    var dl = lib.SQLDL(sSQL,[]);
    patientsData = {};
    dl.SortByList("v0,v1");
    var Count=dl.GetValCount();
    lib.PBSetMaxPos(Count);
    var currentid = 0;
    usingMdsKeys = [];
    for(var i=1;i<=Count;i++){
      var AsgmntKey = dl.GetVal(i,0);
      if(currentid==AsgmntKey) continue;
      currentid = AsgmntKey;
      var patientKey = dl.GetVal(i,1);
      if(!patientsData[patientKey])
        patientsData[patientKey] = {"name":dl.GetVal(i,2),"sex":(dl.GetVal(i,3)?"Ж":"М"),"birth":lib.DateFmt(dl.GetVal(i,4)),"asgmnts":{}};
      patientsData[patientKey].asgmnts[AsgmntKey] = {
        "key":dl.GetVal(i,0),
        "title":dl.GetVal(i,5),
        "mds":dl.GetVal(i,8),
        "md":dl.GetVal(i,6),
        "md_time":dl.GetVal(i,7),
        "week":dl.GetVal(i,9),
        "doc":dl.GetVal(i,10),
        "doctor":dl.GetVal(i,11),
        "cab":dl.GetVal(i,12)
      };
      usingMdsKeys.push(dl.GetVal(i,8));
      lib.PBSetPos(i);
    }
  }
  finally{
    lib.PBHide();
  }
}

function updateTable(){
  Labels = {};
  baseRects = [];
  for(var r in RectsData){
    Form.ExecCmd("remove_item","",RectsData[r].itemID);
    Form.ExecCmd("remove_item","",RectsData[r].labelID);
  }
  for(var r in TablesRectsData){
    Form.ExecCmd("remove_item","",TablesRectsData[r].itemID);
    Form.ExecCmd("remove_item","",TablesRectsData[r].labelID);
  }
  drawTableRects();
  fillTableByAsgmts();
}

function updateDate(){
  FormItem.SetCaption(412,lib.DateFmt(params.date_start));
}

function PeriodBtnButtonClick(){
  var choosenDate = lib.ChooseDateDlg(o_Sys.GetCurrentDate(),"Выберите дату");
  if(!lib.IsDate(choosenDate)) return;
  params.date_start = choosenDate;
  params.date_end = choosenDate;
  updateAll();
}

function sys_close_btnButtonClick(){
  if(!isSync() && lib.QU("Данные не синхронизированы с журналом предварительной записи. Синхронизировать?")){
    exportTimesToPreRecord();
  }
  Form.ExecCmd("close_form","",1);
}

function GetRect(xPos,yPos){
  var iCode = 0;
  while((iCode = Form.ItemFromPoint(xPos,yPos,iCode))>0){
    var rectCode = iCode;
    if(Labels[iCode])
      rectCode = Labels[iCode];
    if(RectsData[rectCode]){
      RectsData[rectCode].deltaX = xPos-RectsData[rectCode].xLeftTopPos;
      RectsData[rectCode].deltaY = yPos-RectsData[rectCode].yLeftTopPos;
      return RectsData[rectCode];
    }
    if(TablesRectsData[rectCode]){
      if(TablesRectsData[rectCode].data && TablesRectsData[rectCode].data.patient)
        CreateAsgmntsRects(TablesRectsData[rectCode].data.patient);
    }
  }
  /*var addRectText = "rect\ntop="+(yPos-o_Sys.ceil(viewParams.rectHeight/2))+"\n"+"width="+viewParams.rectWidth+"\nheight="+
                 viewParams.rectHeight+"\nhide=0\nparent=0\nbkcolor="+0xF6ECE2+"\nleft="+(xPos-o_Sys.ceil(viewParams.rectWidth/2))+"\ncaption=caption";
  var Rect = {"itemID":Form.ExecCmd("add_item",addRectText,0),
    "xLeftTopPos":(xPos-o_Sys.ceil(viewParams.rectWidth/2)),
    "yLeftTopPos":(yPos-o_Sys.ceil(viewParams.rectHeight/2)),
    "width":viewParams.rectWidth,
    "height":viewParams.rectHeight
  };
  
  FormItem.SetCaption(Rect.itemID,"X:"+Rect.xLeftTopPos+" Y:"+Rect.yLeftTopPos);
  FormItem.SetItemLong(Rect.itemID,"rectBorderColor",o_Sys.MakeColor(0,0,0));
  //FormItem.SetItemLong(Rect.itemID,"rectBorderColor",o_Sys.MakeColor(0,0,0));
  return Rect;*/
}

function AttachRect(xPos,yPos,itemID){
  var iCode = 0;
  movingRect = {};
  while((iCode = Form.ItemFromPoint(xPos,yPos,iCode))>0){
    var rectCode = iCode;
    if(Labels[iCode]){
      rectCode = Labels[iCode];
      if(rectCode == itemID) continue;
    }
    if(RectsData[rectCode]){
      return returnRectToBase(itemID);// аттачить туда, где уже что-то есть нельзя
    }
    var needReturn = false;
    if(TablesRectsData[rectCode] && TablesRectsData[rectCode].data){
      if(TablesRectsData[rectCode].data.patient!=RectsData[itemID].data.patient || (TablesRectsData[rectCode].attached>0 && TablesRectsData[rectCode].attached!=itemID))
        needReturn = true;
      if(!needReturn && !TablesRectsData[rectCode].attachable)
        needReturn = true;
      var selectedPreRecordData = selectPreRecord(itemID,rectCode);
      if(!needReturn && !selectedPreRecordData)
        needReturn = true;
      if(needReturn){
        if(!returnToPosition(itemID)) 
          returnRectToBase(itemID);
        return false;
      }
      attachToTableRect(rectCode,itemID,selectedPreRecordData,true);
      return true;
    }
  }
  returnRectToBase(itemID);
  return false;
}

function returnToPosition(itemID){
  movingRect = {};
  if(RectsData[itemID].attached){
    attachToTableRect(RectsData[itemID].attached,itemID,null,true);
    return true;
  }
  return false;
}

function selectPreRecord(agmntRectCode,tableRectCode,forceSelect,onlyList){
  if(!(RectsData[agmntRectCode].data && RectsData[agmntRectCode].data.mds>0)){
    lib.warn("Нет специалистов на указанное время");
    return null;
  }
  var CurDoctor = RectsData[agmntRectCode].data.doctor;
  var CurDoc = RectsData[agmntRectCode].data.doc;
  var mdsKey = RectsData[agmntRectCode].data.mds;
  var acceptableDoctors = [];
  var timeToRec = TablesRectsData[tableRectCode].data.time;
  var DL = lib.GetDataList(1);
  for(var i in prerecordData[mdsKey]){
    for(var rasp in prerecordData[mdsKey][i]){
      var docdata = prerecordData[mdsKey][i][rasp];
      if(!(docdata.time_begin<=timeToRec && docdata.time_end>timeToRec)) continue;
      if(CurDoc==docdata.doc && !forceSelect) return {"doctor":i,"week":docdata.week,"doc":docdata.doc,"cab":docdata.cab};
      acceptableDoctors.push({"doctor":i,"week":docdata.week,"doc":docdata.doc,"cab":docdata.cab});
      if(onlyList) continue;
      var NewVal = DL.AddVal();
      DL.SetValKey(NewVal,0,acceptableDoctors.length);
      var SDocRecord = modules.GetModule("records").GetRecord(o_Sys.stol(i),"sdoc");
      if(modules.GetModule("records").CheckRecordLoaded(SDocRecord)){
        DL.SetVal(NewVal,0,(SDocRecord.Data.sdoc_name || "ФИО не указано"));
      }
      //break;
    }
  }
  if(onlyList){
    return acceptableDoctors;
  }
  if(acceptableDoctors.length==1) return acceptableDoctors[0];
  if(DL.GetValCount()==0){
    lib.warn("Нет специалистов на указанное время");
    return null;
  }
  if(acceptableDoctors.length==1) return acceptableDoctors[0];  var sXML = "xml:<columns><column title=\"ФИО\" width=300 align=left format=str/></columns>";
  var index = dbData.SelectReferenceList("", DL, sXML, "+params:'caption=\"Выберите врача\"';");
  if (index<=0){
    return null;
  }
  return acceptableDoctors[(index-1)];
  /*prerecordData[mdsKey][doctorKey].push({
    "week":DocsData.GetVal(i,7),
    "doc":DocsData.GetVal(i,6),
    "time_begin":DocsData.GetVal(i,4),
    "time_end":DocsData.GetVal(i,5)
  });*/
  return null;
}

function returnRectToBase(itemID){
  movingRect = {};
  if(RectsData[itemID].attached){
    TablesRectsData[RectsData[itemID].attached].attached = 0; 
    unattachedKeys[RectsData[itemID].data.key] = RectsData[itemID];
    if(RectsData[itemID].data.md)
      setSync(false);
    RectsData[itemID].data.doctor = null;
    RectsData[itemID].data.cab = null;
    RectsData[itemID].data.doc = null;
    RectsData[itemID].data.week = null;
    FormItem.SetText(RectsData[itemID].labelID,RectsData[itemID].title);
  }
  var ParentRect = Form.GetItemCode("AsgmntsRect");
  FormItem.SetItemLong(itemID,"parent",ParentRect);
  RectsData[itemID].attached = 0;
  var CurrentValues = {};
  for(var i in baseRects){
    CurrentValues[baseRects[i]] = {
      "X":RectsData[baseRects[i]].xLeftTopPos,
      "Y":RectsData[baseRects[i]].yLeftTopPos,
      "W":RectsData[baseRects[i]].width,
      "H":RectsData[baseRects[i]].height
    };
  }
  if(RectsData[itemID].data && RectsData[itemID].data.key>0)
    unattachedKeys[RectsData[itemID].data.key] = RectsData[itemID];
  drawBaseRect(true); // нужно только вычислить координаты
  for(var i in baseRects){
    var ToValues = {
      "X":RectsData[baseRects[i]].xLeftTopPos,
      "Y":RectsData[baseRects[i]].yLeftTopPos,
      "W":RectsData[baseRects[i]].width,
      "H":RectsData[baseRects[i]].height
    };
    var needAnimator = false;
    for(var v in ToValues){
      if(CurrentValues[baseRects[i]][v]!=ToValues[v]){
        needAnimator = true;
        break;
      }
    }
    if(!needAnimator){
      continue;
    }
    var AniObj = new Animator(baseRects[i],CurrentValues[baseRects[i]], ToValues,1/*1 сек*/,function(rectID,currentVals){
      /*RectsData[rectID].xLeftTopPos = o_Sys.floor(currentVals.X);
      RectsData[rectID].yLeftTopPos = o_Sys.floor(currentVals.Y);
      RectsData[rectID].width = o_Sys.floor(currentVals.W);
      RectsData[rectID].height = o_Sys.floor(currentVals.H);*/
      FormItem.SetItemLong(rectID,"X",o_Sys.floor(currentVals.X));
      FormItem.SetItemLong(rectID,"Y",o_Sys.floor(currentVals.Y));
      FormItem.SetItemLong(rectID,"W",o_Sys.floor(currentVals.W));
      FormItem.SetItemLong(rectID,"H",o_Sys.floor(currentVals.H));
      FormItem.SetItemLong(RectsData[rectID].labelID,"W",o_Sys.floor(currentVals.W)-10);
      FormItem.SetItemLong(RectsData[rectID].labelID,"H",o_Sys.floor(currentVals.H));
      Form.ExecCmd("realign_view","",0);
    });
    AniObj.start();
  }
}

function drawBaseRect(withoutDraw){
  // функция перерисовывает оставшиеся прямоугольники на базе, кроме тех 
  var ParentRect = Form.GetItemCode("AsgmntsRect");
  var TotalWidth = FormItem.GetItemLong(ParentRect,"W");
  var MaxWidthCountAsgmnts = o_Sys.floor(TotalWidth/viewParams.rectAsgmntWidth);
  var Top = FormItem.GetItemLong(ParentRect,"Y")+3;
  var X = FormItem.GetItemLong(ParentRect,"X")+3;
  var Counter = 0;
  for(var r in baseRects){
    if(baseRects[r]==movingRect.itemID) continue;
    if(RectsData[baseRects[r]].attached) continue;
    var itemID = baseRects[r];
    RectsData[itemID].xLeftTopPos = X;
    RectsData[itemID].yLeftTopPos = Top;
    RectsData[itemID].width = viewParams.rectAsgmntWidth;
    RectsData[itemID].height = viewParams.rectAsgmntHeight;
    if(!withoutDraw){
      FormItem.SetItemLong(itemID,"X",RectsData[itemID].xLeftTopPos);
      FormItem.SetItemLong(itemID,"Y",RectsData[itemID].yLeftTopPos);
      FormItem.SetItemLong(itemID,"W",RectsData[itemID].width);
      FormItem.SetItemLong(itemID,"H",RectsData[itemID].height);
      FormItem.SetItemLong(RectsData[itemID].labelID,"W",RectsData[itemID].width-10);
      FormItem.SetItemLong(RectsData[itemID].labelID,"H",RectsData[itemID].height);
    }
    X += viewParams.rectAsgmntWidth+1;
    Counter++;
    if(Counter==MaxWidthCountAsgmnts){
      Counter = 0;
      Top += viewParams.rectAsgmntHeight+5;
    }
  }
}

function highlightPatient(){
//  debugger;
  if(movingRect && movingRect.data && movingRect.data.patient){
    if(!patientTablesRects[movingRect.data.patient]) return;
    for(var i in patientTablesRects[movingRect.data.patient]){
      var rectId = patientTablesRects[movingRect.data.patient][i];
      if(TablesRectsData[rectId].attached) continue; // пропускаем подсветку уже занятых прямоугольников
      if(TablesRectsData[rectId].data.time==null){
        continue;
//        FormItem.SetItemLong(rectId,"rectBkFillColor",Colors.patient_highlight);
//        TablesRectsData[rectId].highlighted = 1;
      }
      else{
        var doctorsList = getDoctorForTime(rectId,movingRect.itemID);
        if(doctorsList.length==0) continue; // не подсвечиваем там, где нет возможности выбрать врача
        var labelTitleArray = [];
        var labelTitleEnding = "";
        if(doctorsList.length>3){
          doctorsList = doctorsList.splice(0,3);
          labelTitleEnding = " ..";
        }
        for(var d in doctorsList){
          //acceptableDoctors.push({"doctor":i,"week":docdata.week,"doc":docdata.doc,"cab":docdata.cab});
          var DoctorRecord = modules.GetModule("records").GetRecord(o_Sys.stol(doctorsList[d].doctor),"sdoc");
          if(modules.GetModule("records").CheckRecordLoaded(DoctorRecord)){
            labelTitleArray.push(DoctorRecord.GetInitials("$fam$ $n$.$sn$."));
          }
        }
        FormItem.SetItemLong(rectId,"rectBkFillColor",Colors.patient_time_highlight);
        FormItem.SetText(TablesRectsData[rectId].labelID,labelTitleArray.join("\\n")+labelTitleEnding);
        TablesRectsData[rectId].highlighted = 1;
      }
    }
  }
  Form.ExecCmd("realign_view","",0);
}

function getDoctorForTime(tableRect,patientRect){
  var Results = selectPreRecord(patientRect,tableRect,true/*forceSelect*/,true/*onlyList*/);
  return Results;
}

function downlightPatient(patientKey){
//  debugger;
  for(var i in patientTablesRects[patientKey]){
    var rectId = patientTablesRects[patientKey][i];
    //if(!TablesRectsData[rectId].highlighted) continue;
    if(TablesRectsData[rectId].data.time==null){
      continue;
//      FormItem.SetItemLong(rectId,"rectBkFillColor",Colors.white);
//      TablesRectsData[rectId].highlighted = 0;
    }
    else{
      FormItem.SetText(TablesRectsData[rectId].labelID,"");
      if(!TablesRectsData[rectId].highlighted) continue;
      FormItem.SetItemLong(rectId,"rectBkFillColor",Colors.slightly_red);
      TablesRectsData[rectId].highlighted = 0;
    }
  }
}

function onFormMouseEvent(evtType,keyState,xPos,yPos){
  if(mouseData.evtType!=evtType || mouseData.keyState!=keyState){
    mouseData.evtType = evtType;
    mouseData.keyState = keyState;
    //FormItem.SetText(303,"evtType="+mouseData.evtType+" keyState="+mouseData.keyState);//"evtType="+evtType+" keyState="+keyState);
  }
  switch(evtType){
    case 10:{ // left btn down
      if(!movingRect || !movingRect.itemID){
        movingRect = GetRect(xPos,yPos);
        highlightPatient();
      }
      break;
    }
    case 11:{ // left btn up
      /*if(movingRect.itemID>0)
        Form.ExecCmd("remove_item","",movingRect.itemID);*/
      if(movingRect && movingRect.itemID > 0){
        var patientKey = movingRect.data.patient;
        FormItem.SetItemLong(movingRect.itemID,"rectBkFillColor",Colors.slightly_green);
        RectsData[movingRect.itemID] = movingRect;
        if(AttachRect(xPos,yPos,movingRect.itemID)){
          setSync(false);
        }
        downlightPatient(patientKey);
      }
      movingRect = {};
      //Form.ExecCmd("rebuild_view","",0);
      break;
    }
    case 12:{ //rbutton down
      break;
    }
    case 13:{ //rbutton up
      var Rect = GetRect(xPos,yPos);
      DropMenu(Rect.itemID);
      break;
    }
    case 14:{ // move
      if(movingRect && movingRect.itemID>0){
        movingRect.xLeftTopPos = xPos-movingRect.deltaX;//(xPos-o_Sys.ceil(viewParams.rectWidth/2));
        movingRect.yLeftTopPos = yPos-movingRect.deltaY;//(yPos-o_Sys.ceil(viewParams.rectHeight/2));
        //movingRect.deltaX = xPos-movingRect.xLeftTopPos;
        //movingRect.deltaY = yPos-movingRect.yLeftTopPos;
        FormItem.SetItemLong(movingRect.itemID,"rectBkFillColor",Colors.dragged_green);
        FormItem.SetItemLong(movingRect.itemID,"X",movingRect.xLeftTopPos);
        FormItem.SetItemLong(movingRect.itemID,"Y",movingRect.yLeftTopPos);
        Form.ExecCmd("realign_view","",0);
        realignBaseRects();
      }
      break;
    }
  }
}

function DropMenu(RectID){
  var Menu = [
    "Выбрать другого врача;;1",
    "Установить этот план до конца лечения;;2"
  ];
  var Result = lib.DropMenu(Menu);
  if(RectsData[RectID].data && RectsData[RectID].attached){
    switch(Result){
      case 1:{
        var preRecord = selectPreRecord(RectID,RectsData[RectID].attached,true/*forceSelect*/);
        if(preRecord){
          attachToTableRect(RectsData[RectID].attached,RectID,preRecord,false/*withAnimation*/);
        }
        break;
      }
      case 2:{
        break;
      }
    }
  }
}

function realignBaseRects(){
  var CurrentValues = {};
  for(var i in baseRects){
    if(movingRect.itemID==baseRects[i]) continue;
    CurrentValues[baseRects[i]] = {
      "X":RectsData[baseRects[i]].xLeftTopPos,
      "Y":RectsData[baseRects[i]].yLeftTopPos,
      "W":RectsData[baseRects[i]].width,
      "H":RectsData[baseRects[i]].height
    };
  }
  drawBaseRect(true); // нужно только вычислить координаты
  for(var i in baseRects){
    if(movingRect.itemID==baseRects[i]) continue;
    var ToValues = {
      "X":RectsData[baseRects[i]].xLeftTopPos,
      "Y":RectsData[baseRects[i]].yLeftTopPos,
      "W":RectsData[baseRects[i]].width,
      "H":RectsData[baseRects[i]].height
    };
    var needAnimator = false;
    for(var v in ToValues){
      if(CurrentValues[baseRects[i]][v]!=ToValues[v]){
        needAnimator = true;
        break;
      }
    }
    if(!needAnimator){
      continue;
    }
    var AniObj = new Animator(baseRects[i],CurrentValues[baseRects[i]], ToValues,1/*1 сек*/,function(rectID,currentVals){
      FormItem.SetItemLong(rectID,"X",o_Sys.floor(currentVals.X));
      FormItem.SetItemLong(rectID,"Y",o_Sys.floor(currentVals.Y));
      FormItem.SetItemLong(rectID,"W",o_Sys.floor(currentVals.W));
      FormItem.SetItemLong(rectID,"H",o_Sys.floor(currentVals.H));
      FormItem.SetItemLong(RectsData[rectID].labelID,"W",o_Sys.floor(currentVals.W)-10);
      FormItem.SetItemLong(RectsData[rectID].labelID,"H",o_Sys.floor(currentVals.H));
      Form.ExecCmd("realign_view","",0);
    });
    AniObj.start();
  }
}

function drawTableRects(){
  patientsTitleRects = {};
  var Columns = generateColumns();
  var ParentRect = Form.GetItemCode("PreRecordRect");
  var Top = FormItem.GetItemLong(ParentRect,"Y")+3;
  //var Top = FormItem.GetItemLong(ParentRect,"Y");
  var addRectText = "rect\nwidth="+viewParams.rectWidth+
  "\nhide=0\nparent="+ParentRect+"\nbkcolor="+o_Sys.MakeColor(255,255,255);
  var addLabelText = "label\nopaque=1\nhide=0";
  var Counter = 0;
  for(var i in Columns){
    var X = 3+(Counter++)*viewParams.rectWidth+1;
    var NewRectID = Form.ExecCmd("add_item",addRectText+"\nleft="+X+"\ntop="+Top+"\nheight="+viewParams.headRectHeight,0);
    var NewLabelID = Form.ExecCmd("add_item",addLabelText+"\nparent="+NewRectID+"\nleft="+(X+5)+"\ntop="+Top+"\nwidth="+(viewParams.rectWidth-6)+"\nheight="+(viewParams.headRectHeight-2),0);
    if(!NewRectID) continue;
    TablesRectsData[NewRectID] = {"itemID":NewRectID,
      "xLeftTopPos":X,
      "yLeftTopPos":Top,
      "width":viewParams.rectWidth,
      "height":viewParams.headRectHeight,
      "title":Columns[i].title,
      "labelID":NewLabelID,
      "deltaX":0,
      "deltaY":0,
      "attachable":false
    };
    FormItem.SetText(NewLabelID,""+TablesRectsData[NewRectID].title+"");
    FormItem.SetItemLong(NewRectID,"rectBkFillColor",Colors.table_head);
    FormItem.SetItemLong(NewRectID,"rectBorderColor",Colors.black);
    FormItem.SetItemLong(NewRectID,"rectViewStyle",(0x0050|0x0100|0x0400));
    FormItem.UpdateItem(NewRectID);
    Labels[NewLabelID] = NewRectID;
  }
  Top += viewParams.headRectHeight+1;
  for(var p in patientsData){
    patientTablesRects[p] = [];
    Counter = 0;
    var X = 3+(Counter++)*viewParams.rectWidth+1;
    var NewRectID = Form.ExecCmd("add_item",addRectText+"\nleft="+X+"\ntop="+Top+"\nheight="+viewParams.rectHeight,0);
    if(!NewRectID) continue;
    var NewLabelID = Form.ExecCmd("add_item",addLabelText+"\nparent="+NewRectID+"\nleft="+(X+5)+"\ntop="+Top+"\nwidth="+(viewParams.rectWidth-5)+"\nheight="+(viewParams.rectHeight-2),0);
    patientTablesRects[p].push(NewRectID);
    var aPatientName = patientsData[p].name.split(" ");
    var patientName = aPatientName[0]+"\\n"+aPatientName.slice(1,aPatientName.length).join(" ");
    TablesRectsData[NewRectID] = {"itemID":NewRectID,
      "xLeftTopPos":X,
      "yLeftTopPos":Top,
      "width":viewParams.rectWidth,
      "height":viewParams.rectHeight,
      "title":patientName,
      "labelID":NewLabelID,
      "deltaX":0,
      "deltaY":0,
      "data":{
        patient:p
      },
      "highlighted":0,
      "attachable":false
    };
    FormItem.SetText(NewLabelID,TablesRectsData[NewRectID].title);
    FormItem.SetItemLong(NewRectID,"rectViewStyle",(0x0050|0x0100|0x0400));
    patientsTitleRects[p] = NewRectID;
    for(var i in Columns){
      if(Columns[i].name=="pat_fio") continue;
      X = 3+(Counter++)*viewParams.rectWidth+1;
      NewRectID = Form.ExecCmd("add_item",addRectText+"\nleft="+X+"\ntop="+Top+"\nheight="+viewParams.rectHeight,0);
      NewLabelID = Form.ExecCmd("add_item",addLabelText+"\nparent="+NewRectID+"\nleft="+(X+5)+"\ntop="+Top+"\nwidth="+(viewParams.rectWidth-5)+"\nheight="+viewParams.rectHeight,0);
      if(!NewRectID) continue;
      patientTablesRects[p].push(NewRectID);
      TablesRectsData[NewRectID] = {"itemID":NewRectID,
        "xLeftTopPos":X,
        "yLeftTopPos":Top,
        "width":viewParams.rectWidth,
        "height":viewParams.rectHeight,
        "title":Columns[i].title,
        "labelID":NewLabelID,
        "deltaX":0,
        "deltaY":0,
        "data":{
          patient:p,
          time:Columns[i].time
        },
        "highlighted":0,
        "attachable":true
      };
      //FormItem.SetText(NewLabelID,""+TablesRectsData[NewRectID].title+"");
      FormItem.SetItemLong(NewRectID,"rectBkFillColor",Colors.slightly_red);
      FormItem.SetItemLong(NewRectID,"rectBorderColor",Colors.white);
      FormItem.SetItemLong(NewRectID,"rectViewStyle",(0x0050|0x0100|0x0400));
      FormItem.UpdateItem(NewRectID);
      Labels[NewLabelID] = NewRectID;
    }
    Top += viewParams.rectHeight+1;
    //FormItem.SetItemLong(NewRectID,"rectBkFillColor",o_Sys.MakeColor(140,140,140));
  }
  Form.ExecCmd("update_scroll","",0);
}

function CreateAsgmntsRects(patientKey){
  var ParentRect = Form.GetItemCode("AsgmntsRect");
  patientKey = (patientKey || 0);
  if(currentPatient>0 && patientKey!=currentPatient){
    if(TablesRectsData[patientsTitleRects[currentPatient]].highlighted){
      FormItem.SetItemLong(patientsTitleRects[currentPatient],"rectBkFillColor",Colors.white);
      TablesRectsData[patientsTitleRects[currentPatient]].highlighted = 0;
    }
  }
  if(patientKey==0){
    currentPatient = 0;
    //FormItem.SetItemLong(ParentRect,"H",0);
    //FormItem.SetItemLong(ParentRect,"visible",0);
    Form.ExecCmd("realign_view","",0);
    return;
  }
  if(currentPatient==patientKey) return;
  currentPatient = patientKey;
  FormItem.SetItemLong(patientsTitleRects[currentPatient],"rectBkFillColor",Colors.patient_highlight);
  TablesRectsData[patientsTitleRects[currentPatient]].highlighted = 1;
//  FormItem.SetItemLong(ParentRect,"rectBkFillColor",Colors.slightly_gray);
//  FormItem.SetItemLong(ParentRect,"rectBorderColor",Colors.black);
//  FormItem.SetItemLong(ParentRect,"rectViewStyle",(0x0050|0x0100|0x0400));
//  FormItem.SetItemLong(ParentRect,"H",viewParams.rectAsgmntHeight*(patientsData[currentPatient].asgmnts.length || 1)+5);
//  FormItem.SetItemLong(ParentRect,"visible",1);
  var TotalWidth = FormItem.GetItemLong(ParentRect,"W");
  var MaxWidthCountAsgmnts = o_Sys.floor(TotalWidth/viewParams.rectAsgmntWidth);
  // сначала удаляем все неприаттаченые прямоугольники и создаем вместо них новые для пациента
  // причем надо смотреть, что нужно создавать, а что уже содержится в приаттаченных прямоугольниках
  for(var i in RectsData){
    if(!RectsData[i].attached){
      Form.ExecCmd("remove_item","",RectsData[i].itemID);
      Form.ExecCmd("remove_item","",RectsData[i].labelID);
      delete RectsData[i];
    }
  }
  Form.ExecCmd("realign_view","",0);
  var addRectText = "rect\nhide=0\nparent="+ParentRect;
  var addLabelText = "label\nopaque=1\nhide=0";
  var Top = FormItem.GetItemLong(ParentRect,"Y")+3;
  var X = FormItem.GetItemLong(ParentRect,"X")+3;
  baseRects = [];
  var Counter = 0;
  for(var as in patientsData[currentPatient].asgmnts){
    var Asgmt = patientsData[currentPatient].asgmnts[as];
    var finded = false;
    for(var r in RectsData){
      if(RectsData[r].data && RectsData[r].data.key==Asgmt.key){
        finded = true;
        baseRects.push(RectsData[r].itemID);
        break;
      }
    }
    if(finded)
      continue;
    //Asgmt.title,Asgmt.key
    var NewRectID = Form.ExecCmd("add_item",addRectText+"\nleft="+X+"\ntop="+Top+"\nheight="+viewParams.rectAsgmntHeight+"\nopaque=0\nwidth="+viewParams.rectAsgmntWidth,0);
    var NewLabelID = Form.ExecCmd("add_item",addLabelText+"\nparent="+NewRectID+"\nleft="+(X+5)+"\ntop="+Top+"\nwidth="+(viewParams.rectAsgmntWidth-5)+"\nheight="+viewParams.rectAsgmntHeight,0);
    if(!NewRectID) continue;
    var title = Asgmt.title;
    if(Asgmt.mds>0){
      var MDSRecord = modules.GetModule("records").GetRecord(Asgmt.mds,"md_shablon");
      if(modules.GetModule("records").CheckRecordLoaded(MDSRecord)){
        title = (MDSRecord.Data.md_shablon_short_title || MDSRecord.Data.md_shablon_title);
      }
    }
    RectsData[NewRectID] = {"itemID":NewRectID,
      "xLeftTopPos":X,
      "yLeftTopPos":Top,
      "width":viewParams.rectAsgmntWidth,
      "height":viewParams.rectAsgmntHeight,
      "title":title,
      "labelID":NewLabelID,
      "deltaX":0,
      "deltaY":0,
      "data":{
        patient:currentPatient,
        key:Asgmt.key,
        md:Asgmt.md,
        mds:Asgmt.mds,
        time:Asgmt.md_time
      },
      "highlighted":0
    };
    FormItem.SetText(NewLabelID,""+RectsData[NewRectID].title+"");
    FormItem.SetItemLong(NewRectID,"rectBkFillColor",Colors.slightly_green);
    FormItem.SetItemLong(NewRectID,"rectBorderColor",Colors.white);
    FormItem.SetItemLong(NewRectID,"rectViewStyle",(0x0050|0x0100|0x0400));
    baseRects.push(NewRectID);
    Labels[NewLabelID] = NewRectID;
    X += viewParams.rectAsgmntWidth+1;
    Counter++;
    if(Counter==MaxWidthCountAsgmnts){
      Counter = 0;
      Top += viewParams.rectAsgmntHeight+5;
    }
  }
  Form.ExecCmd("realign_view","",0);
}

function Animator(rectID,fromVals,toVals,changeTime,callbackOnUpdate){
  this.cyclelength = 20;
  this.rectID = rectID;
  this.fromVals = fromVals;
  this.vals = {};
  for(var i in this.fromVals){
    // инициализируем начальные значения
    this.vals[i] = this.fromVals[i];
  }
  this.toVals = toVals;
  this.timeToChange = changeTime;
  this.onUpdate = callbackOnUpdate;
  this.currentValues = {};
  this.cycles = o_Sys.ceil((this.timeToChange/0.1));
  this.current_cycle = 0;
  this.deltas = this.getDeltas();
}

Animator.prototype.getDeltas = function(){
  var result = {};
  for(var i in this.fromVals){
    var TotalDelta = this.toVals[i]-this.fromVals[i];
    result[i] = TotalDelta/this.cycles;
  }
  return result;
}

Animator.prototype.start = function(){
  this.timer_name = "animator_timer_"+o_Sys.IntRand();
  //this.timer_period = this.timeToChange
  Form.ExecCmd("add_timer", this.timer_name, this.cyclelength);
  animatorTimers[this.timer_name] = this;
  //this.timer = dbTimer.AddDelayTimer(this.timer_name,100,100,1,"","");
}

Animator.prototype.updateValues = function(){
  this.current_cycle++;
  for(var i in this.vals){
    this.vals[i] += this.deltas[i];
    if(this.deltas[i]>0 && this.vals[i]>this.toVals[i]) this.vals[i] = this.toVals[i];
    if(this.deltas[i]<0 && this.vals[i]<this.toVals[i]) this.vals[i] = this.toVals[i];
  }
  this.onUpdate(this.rectID,this.vals);
}

Animator.prototype.onStop = function(onStopMethod){
  if(typeof(onStopMethod)==="function")
    this.onStopMethod = onStopMethod;
}

Animator.prototype.stop = function(){
  if(this.onStopMethod)
    this.onStopMethod(this.rectID,this.toVals);
  Form.ExecCmd("remove_timer", this.timer_name, 0);
}

Animator.prototype.checkStop = function(){
  return (this.current_cycle>=this.cycles);
}

function onFormTimer(tName){
  if(animatorTimers[tName]){
    var animatorObj = animatorTimers[tName];
    animatorObj.updateValues();
    if(animatorObj.checkStop()){
      animatorObj.stop();
      delete animatorObj;
      delete animatorTimers[tName];
    }
  }
  Form.ExecCmd("realign_view","",0);
}

function ConfigBtnButtonClick(){
  if(!isSync() && lib.QU("Данные не синхронизированы с журналом предварительной записи. Синхронизировать?")){
    exportTimesToPreRecord();
  }
  ShowConfigurator();
}

function ShowConfigurator(){
  //params.date_start = o_Sys.GetCurrentDate(); // Сегодня
  //params.date_end = o_Sys.GetCurrentDate(); // Сегодня
  var gpForm = o_Sys.SysObjCreate("form_window");
  if(!gpForm.LoadForm("%FILEPATH%","pre-record\\planning_patient\\config.pgf")){
    return lib.alert("Не удалось загрузить форму pre-record\\planning_patient\\config.pgf");
  }
  var oForm = gpForm.GetFormSink();
  oForm.LDAddValue(lib.Stringify(params),"current_params");
  gpForm.SetParam("dlg_toolbar", "hide");
  gpForm.SetParam("window_caption", "Настройки");
  gpForm.FireEvent("LoadData");
  gpForm.ShowModalForm();
  var newObject = lib.ParseJSONObject(oForm.LDGetValueByName("new_params"));
  if(newObject){
    var changed = false;
    for(var i in newObject){
      if(!changed && (params[i] != newObject[i])) changed = true;
      params[i] = newObject[i];
    }
    if(changed){
      generateColumns();
      updateTable();
      CreateAsgmntsRects(0);
    }
  }
}

function fillTableByAsgmts(){
  //var ParentRect = Form.GetItemCode("AsgmntsRect");
  var addRectText = "rect\nhide=0";
  var addLabelText = "label\nopaque=1\nhide=0";
  for(var p in patientsData)
    for(var as in patientsData[p].asgmnts){
      if((patientsData[p].asgmnts[as].md || 0)==0 || (patientsData[p].asgmnts[as].doc || 0)==0) continue; // пропускаем назначения без услуг и без предвариательной записи
      var TableRectID = findTablecRect(p,patientsData[p].asgmnts[as].md_time);
      if(TableRectID){
        var NewRectID = Form.ExecCmd("add_item",addRectText+"\nparent="+TableRectID+"\nleft=1\ntop=1\nheight="+viewParams.rectHeight+"\nopaque=0\nwidth="+viewParams.rectWidth,0);
        var NewLabelID = Form.ExecCmd("add_item",addLabelText+"\nparent="+NewRectID+"\nleft=6\ntop=1\nwidth="+(viewParams.rectWidth-5)+"\nheight="+viewParams.rectHeight,0);
        if(!NewRectID) continue;
        var title = patientsData[p].asgmnts[as].title;
        if(patientsData[p].asgmnts[as].mds>0){
          var MDSRecord = modules.GetModule("records").GetRecord(patientsData[p].asgmnts[as].mds,"md_shablon");
          if(modules.GetModule("records").CheckRecordLoaded(MDSRecord)){
            title = (MDSRecord.Data.md_shablon_short_title || MDSRecord.Data.md_shablon_title);
          }
        }
        RectsData[NewRectID] = {"itemID":NewRectID,
          "xLeftTopPos":1,
          "yLeftTopPos":1,
          "width":viewParams.rectAsgmntWidth,
          "height":viewParams.rectAsgmntHeight,
          "title":title,
          "labelID":NewLabelID,
          "deltaX":0,
          "deltaY":0,
          "data":{
            patient:o_Sys.stol(p),
            key:patientsData[p].asgmnts[as].key,
            md:patientsData[p].asgmnts[as].md,
            mds:patientsData[p].asgmnts[as].mds,
            time:patientsData[p].asgmnts[as].md_time
          },
          "highlighted":0
        };
        FormItem.SetText(NewLabelID,""+RectsData[NewRectID].title+"");
        FormItem.SetItemLong(NewRectID,"rectBkFillColor",Colors.slightly_green);
        FormItem.SetItemLong(NewRectID,"rectBorderColor",Colors.white);
        FormItem.SetItemLong(NewRectID,"rectViewStyle",(0x0050|0x0100|0x0400));
        if(!patientsData[p].asgmnts[as].doc) continue;
        attachToTableRect(TableRectID,NewRectID,{
          "week":patientsData[p].asgmnts[as].week,
          "doc":patientsData[p].asgmnts[as].doc,
          "doctor":patientsData[p].asgmnts[as].doctor,
          "cab":patientsData[p].asgmnts[as].cab
        },false);
        Labels[NewLabelID] = NewRectID;
      }
    }
  Form.ExecCmd("realign_view","",0);
}

function findTablecRect(patientKey,timeStart){
  try{
    for(var i in patientTablesRects[patientKey]){
      var tableRectID = patientTablesRects[patientKey][i];
      if(TablesRectsData[tableRectID].data && TablesRectsData[tableRectID].data.time==timeStart)
        return tableRectID;
    }
    return null;
  }
  catch(Err){
    return null;
  }
}

function attachToTableRect(tableRectID,asgmntRectId,preRecordData,withAnimation){
  if(unattachedKeys[RectsData[asgmntRectId].data.key]){
    delete unattachedKeys[RectsData[asgmntRectId].data.key];
  }
  if(RectsData[asgmntRectId].attached){
    TablesRectsData[RectsData[asgmntRectId].attached].attached = 0;
  }
  RectsData[asgmntRectId].attached = tableRectID;
  FormItem.SetItemLong(asgmntRectId,"parent",tableRectID);
  TablesRectsData[tableRectID].attached = asgmntRectId;
  if(preRecordData){
    RectsData[asgmntRectId].data.week = preRecordData.week;
    RectsData[asgmntRectId].data.doctor = preRecordData.doctor;
    RectsData[asgmntRectId].data.doc = preRecordData.doc;
    RectsData[asgmntRectId].data.cab = preRecordData.cab;
  }
  RectsData[asgmntRectId].data.time = TablesRectsData[tableRectID].data.time;
  var doctorName = "<врач не указан>";
  var cabinetName = "";
  if(RectsData[asgmntRectId].data.doctor){
    var doctorRec = modules.GetModule("records").GetRecord(RectsData[asgmntRectId].data.doctor,"sdoc");
    var cabinetRec = modules.GetModule("records").GetRecord(RectsData[asgmntRectId].data.cab,"kcab");
    if(modules.GetModule("records").CheckRecordLoaded(doctorRec))
      doctorName = doctorRec.GetInitials("$fam$ $n$.$sn$.");
    if(modules.GetModule("records").CheckRecordLoaded(cabinetRec))
      cabinetName = cabinetRec.GetTitle();
    
    
  }
  FormItem.SetText(RectsData[asgmntRectId].labelID,RectsData[asgmntRectId].title+"\\n"+doctorName+lib.NotEmptyTo("\\n",cabinetName));
  if(withAnimation){
    var FromValues = {
      "X":RectsData[asgmntRectId].xLeftTopPos,
      "Y":RectsData[asgmntRectId].yLeftTopPos,
      "W":RectsData[asgmntRectId].width,
      "H":RectsData[asgmntRectId].height
    };
    var ToValues = {
      "X":TablesRectsData[tableRectID].xLeftTopPos,
      "Y":TablesRectsData[tableRectID].yLeftTopPos,
      "W":TablesRectsData[tableRectID].width,
      "H":TablesRectsData[tableRectID].height
    };
    var AniObj = new Animator(asgmntRectId,FromValues, ToValues,1/*1 сек*/,function(rectID,currentVals){
      /*RectsData[rectID].xLeftTopPos = o_Sys.floor(currentVals.X);
      RectsData[rectID].yLeftTopPos = o_Sys.floor(currentVals.Y);
      RectsData[rectID].width = o_Sys.floor(currentVals.W);
      RectsData[rectID].height = o_Sys.floor(currentVals.H);*/
      FormItem.SetItemLong(rectID,"X",o_Sys.floor(currentVals.X));
      FormItem.SetItemLong(rectID,"Y",o_Sys.floor(currentVals.Y));
      FormItem.SetItemLong(rectID,"W",o_Sys.floor(currentVals.W));
      FormItem.SetItemLong(rectID,"H",o_Sys.floor(currentVals.H));
      FormItem.SetItemLong(RectsData[rectID].labelID,"W",o_Sys.floor(currentVals.W)-5);
      FormItem.SetItemLong(RectsData[rectID].labelID,"H",o_Sys.floor(currentVals.H));
      Form.ExecCmd("realign_view","",0);
    });
    AniObj.onStop(function(rectID,values){
      RectsData[rectID].xLeftTopPos = values.X;
      RectsData[rectID].yLeftTopPos = values.Y;
      RectsData[rectID].width = values.W;
      RectsData[rectID].height = values.H;
    });
    AniObj.start();
  }
  else{
    RectsData[asgmntRectId].xLeftTopPos = TablesRectsData[tableRectID].xLeftTopPos;
    RectsData[asgmntRectId].yLeftTopPos = TablesRectsData[tableRectID].yLeftTopPos;
    RectsData[asgmntRectId].width = TablesRectsData[tableRectID].width;
    RectsData[asgmntRectId].height = TablesRectsData[tableRectID].height;
    FormItem.SetItemLong(asgmntRectId,"X",RectsData[asgmntRectId].xLeftTopPos);
    FormItem.SetItemLong(asgmntRectId,"Y",RectsData[asgmntRectId].yLeftTopPos);
    FormItem.SetItemLong(asgmntRectId,"W",RectsData[asgmntRectId].width);
    FormItem.SetItemLong(asgmntRectId,"H",RectsData[asgmntRectId].height);
    FormItem.SetItemLong(RectsData[asgmntRectId].labelID,"W",RectsData[asgmntRectId].width-5);
    FormItem.SetItemLong(RectsData[asgmntRectId].labelID,"H",RectsData[asgmntRectId].height);
    Form.ExecCmd("realign_view","",0);
  }
    

//  FormItem.SetText(RectsData[asgmntRectId].labelID,RectsData[asgmntRectId].title+"\\n"+doctorName);
//  FormItem.SetItemLong(asgmntRectId,"X",RectsData[asgmntRectId].xLeftTopPos);
//  FormItem.SetItemLong(asgmntRectId,"Y",RectsData[asgmntRectId].yLeftTopPos);
//  FormItem.SetItemLong(asgmntRectId,"W",RectsData[asgmntRectId].width);
//  FormItem.SetItemLong(asgmntRectId,"H",RectsData[asgmntRectId].height);
//  FormItem.SetItemLong(RectsData[asgmntRectId].labelID,"W",RectsData[asgmntRectId].width-5);
//  FormItem.SetItemLong(RectsData[asgmntRectId].labelID,"H",RectsData[asgmntRectId].height);
//  Form.ExecCmd("realign_view","",0);
}

function sys_save_btnButtonClick(){
  exportTimesToPreRecord();
}

function exportTimesToPreRecord(){
  for(var i in TablesRectsData){
    try{
      if(!TablesRectsData[i].attached) continue; // пропускаем те, где ничего нет
      if(!RectsData[TablesRectsData[i].attached]) continue;
      var asgmntRect = RectsData[TablesRectsData[i].attached];
      if(asgmntRect.data){
        createMD(asgmntRect,asgmntRect.data.md);
        // при изменении времени или доктора нужно обновить данные в услуге
      }
    }
    catch(Err){
      lib.alert(Err.message);
    }
  }
  // удаляем записи услуг (или только поля для ЖПЗ) по удаленным из таблицы услугам
  for(var i in unattachedKeys){
    try{
      // i - ключ назначения, а unattachedKeys[i] - удаленный прямоугольник
      if(unattachedKeys[i].data && unattachedKeys[i].data.md>0){
        deleteMD(o_Sys.stol(i),unattachedKeys[i].data.md);
        // при изменении времени или доктора нужно обновить данные в услуге
      }
    }
    catch(Err){
      lib.alert(Err.message);
    }
  }
  setSync(true);
  lib.info("Синхронизация с журналом предварительной записи завершена");
}

function deleteMD(asgmntKey,mdKey){
  // для услуги будут удаляться данные для ЖПЗ (ссылки на кабинет, отделение, врача, расписание и время заказа)
  var MDRecord = modules.GetModule("records").GetRecord(o_Sys.stol(mdKey),"md");
  if(!modules.GetModule("records").CheckRecordLoaded(MDRecord)){
    return;
  }
  MDRecord.Data.md_date_zakaz = null;
  MDRecord.Data.md_time_zakaz = null;
  MDRecord.Data.md_sdoc_link = null;
  MDRecord.Data.md_kcab_link = null;
  MDRecord.Data.md_doc_link = null;
  MDRecord.md_refferral_link = null;
  MDRecord.md_len_zakaz = null;
  MDRecord.md_zakaz_filial = null;
  MDRecord.md_week_tmtbl_link = null;
  MDRecord.md_doc_tmtbl_link = null;
  MDRecord.Save(true);
  var TimeRecord = modules.GetModule("records").GetRecord(asgmntKey,"nazntime");
  if(!modules.GetModule("records").CheckRecordLoaded(TimeRecord)) return;
  TimeRecord.Data.nazntime_rec_status = 0;
  TimeRecord.Save(true);
}

function createMD(asgmntRect,mdKey){
  var MDRecord;
  var TemplRecord = modules.GetModule("records").GetRecord(asgmntRect.data.mds,"md_shablon");
  if(!modules.GetModule("records").CheckRecordLoaded(TemplRecord)){
    return false;
  }
  var patientKey = o_Sys.stol(asgmntRect.data.patient);
  var patFio = smv.GetFldValueByKey(patientKey,"pat_fio","patient");
  var ParentKey = patientKey;
  var ParentName = "patient";
  var ParentMDKey = lib.NullTo(smv.GetParent(TemplRecord.Key,"md_shablon"),0);
  if(ParentMDKey>0){
    var ShType = lib.NullTo(smv.GetFldValueByKey(ParentMDKey, "md_shablon_type"), "");
    var ShTag = lib.NullTo(smv.GetFldValueByKey(ParentMDKey, "md_shablon_tag"), 1);
    if(ShType == "cmd" && ShTag == 3){
      var ParentRecord = objects.objRecord(ParentMDKey, "md_shablon");
      var CMDKey = modules.GetModule("oc_md").CreateCMD(ParentRecord, patientKey, patientKey, "patient");
      if(CMDKey <= 0){
        lib.alert("Ошибка при создании услуги");
        return;
      }
      ParentKey = CMDKey;
      ParentName = "md";
    }
  }
  if(mdKey)
    MDRecord = modules.GetModule("records").GetRecord(mdKey,"md");
  else{
    MDRecord = lib.AddRecord("md",ParentKey,ParentName,false,{},true);
  }
  if (!modules.GetModule("records").CheckRecordLoaded(MDRecord)){
    if(MDRecord.Key>0) MDRecord.Delete();
    return false;
  }

  MDRecord.Data.md_poluchat_link = patientKey;
  MDRecord.Data.md_poluchat = patFio;
  MDRecord.Data.md_title = TemplRecord.Data.md_shablon_title;
  MDRecord.Data.md_code = TemplRecord.Data.md_shablon_code;
  MDRecord.Data.md_price = TemplRecord.Data.md_shablon_cost;
  MDRecord.Data.md_fullprice = TemplRecord.Data.md_shablon_cost;
  MDRecord.Data.md_code_place = TemplRecord.Data.md_shablon_place;
  MDRecord.Data.md_type = TemplRecord.Data.md_shablon_type;
  MDRecord.Data.md_class = TemplRecord.Data.md_shablon_class;
  MDRecord.Data.md_ext = TemplRecord.Data.md_shablon_ext;
  MDRecord.Data.md_mkb = TemplRecord.Data.md_shablon_mkb;
  MDRecord.Data.md_src_ref = TemplRecord.Key;
  //MDRecord.Save(true/*alerts*/);

  var kKab = smv.GetFldValueByKey(asgmntRect.data.doc,"doc_tmtbl_kcab_link");
  var kSDoc = smv.GetFldValueByKey(asgmntRect.data.doc,"doc_tmtbl_sdoc");
  var kOtd = smv.GetFldValueByKey(asgmntRect.data.doc,"doc_tmtbl_kotd_link");
  var filial = smv.GetFldValueByKey(asgmntRect.data.doc,"doc_tmtbl_filial");


  if(MDRecord.Key <= 0) return false;
  var CabinetRecord = lib.CACHE.GetFromCacheWithLoad(kKab,"kcab");
  var DoctorRecord = lib.CACHE.GetFromCacheWithLoad(kSDoc,"sdoc");
  var DepRecord = lib.CACHE.GetFromCacheWithLoad(kOtd,"kotd");

  MDRecord.Data.md_sdoc_link = kSDoc;
  MDRecord.Data.md_sdoc_name = DoctorRecord?DoctorRecord.Data.sdoc_name:null;
  MDRecord.Data.md_kcab_link = kKab;
  MDRecord.Data.md_kcab_title = CabinetRecord?CabinetRecord.Data.kcab_title:null;
  MDRecord.Data.md_depart_link = kOtd;
  MDRecord.Data.md_depart_name = DepRecord?DepRecord.Data.kotd_name:null;
  MDRecord.Data.md_date_zakaz = params.date_start;
  MDRecord.Data.md_time_zakaz = asgmntRect.data.time;
  MDRecord.Data.md_len_zakaz = params.kvant;
  MDRecord.Data.md_changed = null;
  MDRecord.Data.md_zakaz_filial = filial;

  MDRecord.Data.md_doc_tmtbl_link = asgmntRect.data.doc;
  MDRecord.Data.md_week_tmtbl_link = asgmntRect.data.week;
  MDRecord.Data.md_nazn_link = asgmntRect.data.key;
  MDRecord.Save(true/*alerts*/);

  var objData =
    {"sPoluch":lib.NullTo(patFio,""),
    "sMDTitle":lib.NullTo(TemplRecord.Data.md_shablon_title,""),
    "iMDDateZakaz":lib.NullTo(params.date_start,0),
    "iMDTimeZakaz":lib.NullTo(asgmntRect.data.time,0),
    "iMDLenZakaz":lib.NullTo(params.kvant,0),
    "sSDocName":lib.NullTo(smv.GetFldValueByKey(kSDoc,"sdoc_name"),""),
    "sKCabTitle":lib.NullTo(smv.GetFldValueByKey(kKab,"kcab_name"),""),
    "sDepartName":lib.NullTo(smv.GetFldValueByKey(kOtd,"kotd_name"),"")};
  var InfoString = objData.sPoluch+","+
    "заказ:"+objData.sMDTitle+" "+lib.DateFmt(objData.iMDDateZakaz,"dd.mm.yy")+" "+o_Sys.FormatTime(objData.iMDTimeZakaz)+"("+objData.iMDLenZakaz+"м)"+
    ", врач "+objData.sSDocName+", каб. "+objData.sKCabTitle+", отд. "+objData.sDepartName;

  lib.AddToLog(MDRecord.Key, "md", lib.xAdd, "ЖПЗ: запись " +InfoString);
  modules.GetModule("oc_nazn").SetBeforRecForAsgmnt(asgmntRect.data.key, params.date_start, asgmntRect.data.time, true);
}

function getPreRecordData(){
  // нужно получить список докторов, которые работают с услугами из назначений
  try{
    prerecordData = {};
    lib.PBShow("Сбор данных для предварительной записи");
    lib.PBSetPos(0);
    lib.PBSetMaxPos(1);
    var sSQL ="select cid \n, /*v0*/ \n"+
    "doc_tmtbl_sdoc, /*v1*/ \n"+
    "doc_tmtbl_excl, /*v2*/ \n"+
    "sdoc_tmtbl_excl, /*v3*/ \n"+
    "doc_tmtbl_begin, /*v4*/ \n"+
    "doc_tmtbl_end, /*v5*/ \n"+  
    "pid, /*v6*/ \n"+
    "doc_tmtbl_weektimetbl, /*v7*/ \n"+
    "doc_tmtbl_kcab_link /*v8*/ \n"+
    " FROM (SELECT cid,pid FROM vdb_rel WHERE prec="+lib.GetRecCode("doc_tmtbl")+" and crec="+lib.GetRecCode("md_shablon")+" and cid IN("+usingMdsKeys.join(",")+")) as relt left join \n"+
    " (select srcid,fval as doc_tmtbl_sdoc from "+lib.getVDBTableNameByFieldName('doc_tmtbl_sdoc')+" where (fld="+lib.GetFldCode('doc_tmtbl_sdoc')+")) as t2 "+
    "     on (pid=t2.srcid) left join \n"+
    " (select srcid,fval as sdoc_tmtbl_excl from "+lib.getVDBTableNameByFieldName('sdoc_tmtbl_excl')+" where (fld="+lib.GetFldCode('sdoc_tmtbl_excl')+")) as t21 "+
    "     on (doc_tmtbl_sdoc=t21.srcid) left join \n"+
    " (select srcid,fval as doc_tmtbl_kcab_link from "+lib.getVDBTableNameByFieldName('doc_tmtbl_kcab_link')+" where (fld="+lib.GetFldCode('doc_tmtbl_kcab_link')+")) as t211 "+
    "     on (pid=t211.srcid) left join \n"+
    " (select srcid,fval as doc_tmtbl_sdate from "+lib.getVDBTableNameByFieldName('doc_tmtbl_sdate')+" where (fld="+lib.GetFldCode('doc_tmtbl_sdate')+")) as t3 "+
    "     on (pid=t3.srcid) left join \n"+
    " (select srcid,fval as doc_tmtbl_edate from "+lib.getVDBTableNameByFieldName('doc_tmtbl_edate')+" where (fld="+lib.GetFldCode('doc_tmtbl_edate')+")) as t4 "+
    "     on (pid=t4.srcid) left join \n"+
    " (select srcid,fval as doc_tmtbl_day from "+lib.getVDBTableNameByFieldName('doc_tmtbl_day')+" where (fld="+lib.GetFldCode('doc_tmtbl_day')+")) as t5 "+
    "     on (pid=t5.srcid) left join \n"+
    " (select srcid,fval as doc_tmtbl_excl from "+lib.getVDBTableNameByFieldName('doc_tmtbl_excl')+" where (fld="+lib.GetFldCode('doc_tmtbl_excl')+")) as t6 "+
    "     on (pid=t6.srcid) left join \n"+
    " (select srcid,fval as doc_tmtbl_weektimetbl from "+lib.getVDBTableNameByFieldName('doc_tmtbl_weektimetbl')+" where (fld="+lib.GetFldCode('doc_tmtbl_weektimetbl')+")) as t91 "+
    "     on (pid=t91.srcid) left join \n"+
    " (select srcid,fval as doc_tmtbl_begin from "+lib.getVDBTableNameByFieldName('doc_tmtbl_begin')+" where (fld="+lib.GetFldCode('doc_tmtbl_begin')+")) as t9 "+
    "     on (pid=t9.srcid) left join \n"+
    " (select srcid,fval as doc_tmtbl_end from "+lib.getVDBTableNameByFieldName('doc_tmtbl_end')+" where (fld="+lib.GetFldCode('doc_tmtbl_end')+")) as t11 "+
    "     on (pid=t11.srcid) WHERE "+params.date_start+" BETWEEN doc_tmtbl_sdate and doc_tmtbl_edate"+
    " AND doc_tmtbl_day="+o_Sys.GetDayOfWeek(o_Sys.GetDay(params.date_start),o_Sys.GetMonth(params.date_start),o_Sys.GetYear(params.date_start));
    var DocsData = lib.SQLDL(sSQL,[]);
    var Count=DocsData.GetValCount();
    lib.PBSetMaxPos(Count);
    for(var i=1;i<=Count;i++){
      lib.PBSetPos(i);
      var mdsKey = DocsData.GetVal(i,0);
      var excludings = DocsData.GetVal(i,2)+lib.NotEmptyTo(",",DocsData.GetVal(i,3));
      if(excludings){
        if (modules.GetModule("oc_week_tmtbl").CheckExcludeDateList(excludings,params.date_start))
          continue; // этот элемент расписания не подходит нам
      }
      var doctorKey = DocsData.GetVal(i,1);
      if(!prerecordData[mdsKey]) prerecordData[mdsKey] = {};
      if(!prerecordData[mdsKey][doctorKey]) prerecordData[mdsKey][doctorKey] = [];
      // записываем врача для дальнейшего подбора правильного врача и элемента расписания под услуги
      prerecordData[mdsKey][doctorKey].push({
        "week":DocsData.GetVal(i,7),
        "doc":DocsData.GetVal(i,6),
        "cab":DocsData.GetVal(i,8),
        "time_begin":DocsData.GetVal(i,4),
        "time_end":DocsData.GetVal(i,5)
      });
    }
  }
  finally{
    lib.PBHide();
  }
}

function sys_save_close_btnButtonClick(){
  if(!exportTimesToPreRecord()) return;
  sys_close_btnButtonClick();
}

function PrevDayBtnButtonClick(){
  if(!isSync() && lib.QU("Данные не синхронизированы с журналом предварительной записи. Синхронизировать?")){
    exportTimesToPreRecord();
  }
  params.date_start = o_Sys.ModifyDate(params.date_start,-1,1);
  params.date_end = o_Sys.ModifyDate(params.date_end,-1,1);
  updateAll();
}

function NextDayBtnButtonClick(){
  if(!isSync() && lib.QU("Данные не синхронизированы с журналом предварительной записи. Синхронизировать?")){
    exportTimesToPreRecord();
  }
  params.date_start = o_Sys.ModifyDate(params.date_start,1,1);
  params.date_end = o_Sys.ModifyDate(params.date_end,1,1);
  updateAll();
}

function updateAll(){
  updateDate();
  updateData();
  getPreRecordData();
  generateColumns();
  updateTable();
  setSync(true);
}

function isSync(){
  return (synchronized?true:false);
}

function setSync(value){
  synchronized = (value?true:false);
  FormItem.SetEnabled(336,!synchronized);
}
