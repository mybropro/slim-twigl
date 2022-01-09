
import 'whatwg-fetch';
import Promise from 'promise-polyfill';
import {Fragmen} from './fragmen.js';

(() => {

let canvas     = null; // スクリーン
let editor     = null; // Ace editor のインスタンス
let lineout    = null; // ステータスバー DOM
let counter    = null; // 文字数カウンター DOM
let message    = null; // メッセージ DOM
let mode       = null; // variable mode select
let animate    = null; // アニメーション用 toggle
let download   = null; // download button
let link       = null; // generate link button
let viewlink       = null; // generate link button
let layer      = null; // dialog layer
let dialog     = null; // dialog message wrapper
let canvasWrap = null; // canvas を包んでいるラッパー DOM
let editorWrap = null; // editor を包んでいるラッパー DOM
let iconColumn = null; // icon を包んでいるラッパー DOM
let infoIcon   = null; // information icon
let fullIcon   = null; // fullscreen icon
let menuIcon   = null; // menu icon
let hideIcon   = null; // hide menu icon

let latestStatus       = 'success';            // 直近のステータス
let isEncoding         = false;                // エンコード中かどうか
let currentMode        = Fragmen.MODE_CLASSIC; // 現在の Fragmen モード
let currentSource      = '';                   // 直近のソースコード
let fragmen            = null;                 // fragmen.js のインスタンス

let urlParameter = null;  // GET パラメータを解析するための searchParams オブジェクト
let vimMode      = false; // vim mode
let syncScroll   = true;  // エディタ上で配信を受けている場合にスクロール同期するか

let editorFontSize = 17;          // エディタのフォントサイズ

// fragmen.js 用のオプションの雛形
const FRAGMEN_OPTION = {
    target: null,
    eventTarget: null,
    mouse: true,
    resize: true,
    escape: false
}
// 外部サービスへリクエストする際のベース URL
const BASE_URL = location.protocol +
      "//" +
      location.host +
      location.pathname;


window.addEventListener('DOMContentLoaded', () => {

    // DOM への参照
    canvas     = document.querySelector('#webgl');
    lineout    = document.querySelector('#lineout');
    counter    = document.querySelector('#counter');
    message    = document.querySelector('#message');
    mode       = document.querySelector('#modeselect');
    animate    = document.querySelector('#pausetoggle');
    download   = document.querySelector('#downloadgif');
    link       = document.querySelector('#permanentlink');
    viewlink   = document.querySelector('#permanentviewlink');
    layer      = document.querySelector('#layer');
    dialog     = document.querySelector('#dialogmessage');
    canvasWrap = document.querySelector('#canvaswrap');
    editorWrap = document.querySelector('#editorwrap');
    iconColumn = document.querySelector('#globaliconcolumn');
    infoIcon   = document.querySelector('#informationicon');
    fullIcon   = document.querySelector('#fullscreenicon');
    menuIcon   = document.querySelector('#togglemenuicon');
    hideIcon   = document.querySelector('#hidemenuicon');


    // fragmen からデフォルトのソース一覧を取得
    const fragmenDefaultSource = Fragmen.DEFAULT_SOURCE;

    // メニュー及びエディタを非表示にするかどうかのフラグ
    let isLayerHidden = false;

    // URL の GET パラメータの解析
    urlParameter = getParameter();
    urlParameter.forEach((value, key) => {
        switch(key){
            case 'mode':
                currentMode = parseInt(value);
                break;
            case 'source':
                currentSource = value;
                break;
            case 'ol': // overlay (hide menu view)
                document.querySelector('#wrap').classList.add('overlay');
                isLayerHidden = true;
                break;
            case 'preview'://hide everything excep the canvas
                document.querySelector("#globaliconwrap").classList.add('invisible');
                isLayerHidden = true;
                break;
        }
    });
    // URL パラメータより得たカレントモードが存在するか
    if(fragmenDefaultSource[currentMode] != null){
        mode.selectedIndex = currentMode;
    }else{
        currentMode = Fragmen.MODE_CLASSIC;
    }
    // この時点でカレントソースが空である場合既定のソースを利用する
    if(currentSource === ''){
        currentSource = fragmenDefaultSource[currentMode];
    }

    // channel ID がある場合は配信に関係している状態とみなす
    let invalidURL = false;

    if(invalidURL === true){
        // 無効な URL とみなされるなにかがあったので通常の初期化フローにする
        graphicsDisable = false;
    }

    // Ace editor 関連の初期化
    let timeoutId = null;
    editor = editorSetting('editor', currentSource, (evt) => {
        // １秒以内の場合はタイマーをキャンセル
        if(timeoutId != null){clearTimeout(timeoutId);}
        timeoutId = setTimeout(() => {
            timeoutId = null;
            update(editor.getValue());
        }, 1000);
        // 文字数の出力
        counter.textContent = `${editor.getValue().length}`;
    }, (evt) => {
    });


    // ウィンドウのリサイズ時
    window.addEventListener('resize', () => {
        resize();
    }, false);
    // 最初に一回リサイズ相当の処理を行っておく
    resize();

    // モード変更時の処理
    mode.addEventListener('change', () => {
        const defaultSourceInPrevMode = fragmenDefaultSource[currentMode];

        const source = editor.getValue();
        currentMode = parseInt(mode.value);
        fragmen.mode = currentMode;

        // 既定のソースと同じならモードに応じた既定のソースに書き換える
        if(source === defaultSourceInPrevMode){
            const defaultSource = fragmenDefaultSource[currentMode];
            editor.setValue(defaultSource);
            setTimeout(() => {editor.gotoLine(1);}, 100);
        }else{
            // ソースを置き換えないとしてもビルドはしなおす
            update(editor.getValue());
        }
    }, false);

    // アニメーション有効・無効設定用トグル
    animate.addEventListener('change', () => {
        if(animate.checked === true){
            // オンにされた場合はコンパイルを行う
            if(fragmen != null){
                fragmen.setAnimation(true);
                update(editor.getValue());
                fragmen.draw();
            }
        }else{
            // オフにされた場合はアニメーションさせない設定に切り替える
            if(fragmen != null){
                fragmen.setAnimation(false);
            }
        }
    }, false);


    // ダウンロードボタン
    download.addEventListener('click', () => {
        // ボタンに disabled が付与されているかエンコード中は即時終了
        if(
            download.classList.contains('disabled') === true ||
            isEncoding === true
        ){
            return;
        }

        // ダウンロード用のパラメータを設定するダイアログを表示する
        const wrap = document.createElement('div');
        wrap.setAttribute('id', 'downloadconfig');
        const infoHeader = document.createElement('h3');
        infoHeader.textContent = 'Download';
        wrap.appendChild(infoHeader);
        // エクスポートの種類
        const typeWrap = document.createElement('div');
        const typeRadioGif = document.createElement('input');
        typeRadioGif.setAttribute('type', 'radio');
        typeRadioGif.setAttribute('name', 'typeradio');
        typeRadioGif.checked = true;
        const typeRadioGifLabel = document.createElement('label');
        const typeRadioGifCaption = document.createElement('span');
        typeRadioGifCaption.textContent = 'Gif';
        typeRadioGifLabel.appendChild(typeRadioGif);
        typeRadioGifLabel.appendChild(typeRadioGifCaption);
        const typeRadioWebM = document.createElement('input');
        typeRadioWebM.setAttribute('type', 'radio');
        typeRadioWebM.setAttribute('name', 'typeradio');
        const typeRadioWebMLabel = document.createElement('label');
        const typeRadioWebMCaption = document.createElement('span');
        typeRadioWebMCaption.textContent = 'WebM';
        typeRadioWebMLabel.appendChild(typeRadioWebM);
        typeRadioWebMLabel.appendChild(typeRadioWebMCaption);
        typeWrap.appendChild(typeRadioGifLabel);
        typeWrap.appendChild(typeRadioWebMLabel);
        wrap.appendChild(typeWrap);
        // フレーム数
        const frameWrap = document.createElement('div');
        const frameInput = document.createElement('input');
        frameInput.setAttribute('type', 'number');
        frameInput.value = 1600;
        frameInput.min = 1;
        frameInput.addEventListener('change', () => {
            frameInput.value = Math.max(frameInput.value, 1);
        }, false);
        const frameCaption = document.createElement('span');
        frameCaption.textContent = 'frames';
        frameWrap.appendChild(frameCaption);
        frameWrap.appendChild(frameInput);
        wrap.appendChild(frameWrap);
        // 解像度
        const resolutionWrap = document.createElement('div');
        const resolutionCaption = document.createElement('span');
        resolutionCaption.textContent = 'resolution';
        const widthInput = document.createElement('input');
        widthInput.setAttribute('type', 'number');
        widthInput.value = 512
        widthInput.min = 1;
        widthInput.addEventListener('change', () => {
            widthInput.value = Math.max(widthInput.value, 1);
        }, false);
        const heightInput = document.createElement('input');
        heightInput.setAttribute('type', 'number');
        heightInput.value = 512
        heightInput.min = 1;
        heightInput.addEventListener('change', () => {
            heightInput.value = Math.max(heightInput.value, 1);
        }, false);
        const resolutionCross = document.createElement('span');
        resolutionCross.classList.add('cross');
        resolutionCross.textContent = 'x';
        resolutionWrap.appendChild(resolutionCaption);
        resolutionWrap.appendChild(widthInput);
        resolutionWrap.appendChild(resolutionCross);
        resolutionWrap.appendChild(heightInput);
        wrap.appendChild(resolutionWrap);
        // フレームレート
        const framerateWrap = document.createElement('div');
        const framerateInput = document.createElement('input');
        framerateInput.setAttribute('type', 'number');
        framerateInput.value = 60;
        framerateInput.min = 10;
        framerateInput.max = 60;
        framerateInput.addEventListener('change', () => {
            framerateInput.value = Math.min(Math.max(framerateInput.value, 10), 60);
        }, false);
        const framerateCaption = document.createElement('span');
        framerateCaption.textContent = 'framerate';
        framerateWrap.appendChild(framerateCaption);
        framerateWrap.appendChild(framerateInput);
        wrap.appendChild(framerateWrap);
        // 品質
        const qualityWrap = document.createElement('div');
        const qualityInput = document.createElement('input');
        qualityInput.setAttribute('type', 'number');
        qualityInput.value = 100;
        qualityInput.min = 10;
        qualityInput.max = 100;
        qualityInput.addEventListener('change', () => {
            qualityInput.value = Math.min(Math.max(qualityInput.value, 0), 100);
        }, false);
        const qualityCaption = document.createElement('span');
        qualityCaption.textContent = 'quality';
        qualityWrap.appendChild(qualityCaption);
        qualityWrap.appendChild(qualityInput);
        wrap.appendChild(qualityWrap);

        showDialog(wrap, {okLabel: 'start'})
        .then((isOk) => {
            if(isOk !== true){return;}
            if(
                isNaN(parseInt(frameInput.value)) === true ||
                isNaN(parseInt(widthInput.value)) === true ||
                isNaN(parseInt(heightInput.value)) === true ||
                isNaN(parseInt(framerateInput.value)) === true ||
                isNaN(parseInt(qualityInput.value)) === true ||
                false
            ){
                alert('Should not be blank.');
                return;
            }
            // disabled を付与して連続で押せないようにする
            download.classList.add('disabled');
            // ダウンロードボタンの表記を変えておく
            download.textContent = 'generate...';
            // エンコード中のフラグを立てておく
            isEncoding = true;
            // 各種パラメータを DOM から取得してキャプチャ開始する
            setTimeout(() => {
                captureAnimation(
                    parseInt(frameInput.value),
                    parseInt(widthInput.value),
                    parseInt(heightInput.value),
                    typeRadioGif.checked === true ? 'gif' : 'webm',
                    parseInt(framerateInput.value),
                    parseInt(qualityInput.value) * 0.99999,
                );
            }, 100);
        });
    }, false);

    // リンク生成ボタン
    link.addEventListener('click', () => {
        if(link.classList.contains('disabled') === true){return;}
        link.classList.add('disabled');
        copyToClipboard(generatePermamentLink())
        alert("Coped editor link to the clipboard!");
        link.classList.remove('disabled');
    }, false);
    viewlink.addEventListener('click', () => {
        if(viewlink.classList.contains('disabled') === true){return;}
        viewlink.classList.add('disabled');
        copyToClipboard(generatePermamentViewLink())
        alert("Coped view link to the clipboard!");
        viewlink.classList.remove('disabled');
    }, false);


    // メインとなる fragmen のインスタンス
    const option = Object.assign(FRAGMEN_OPTION, {
        target: canvas,
        eventTarget: window,
    });
    fragmen = new Fragmen(option);
    // シェーダが更新された段階で同時にメッセージを更新
    fragmen.onBuild((status, msg) => {
        latestStatus = status;
        lineout.classList.remove('warn');
        lineout.classList.remove('error');
        lineout.classList.add(status);
        message.textContent = msg;
        switch(status){
            case 'warn':
            case 'error':
                download.classList.add('disabled');
                link.classList.add('disabled');
                viewlink.classList.add('disabled');
                break;
            default:
                download.classList.remove('disabled');
                if(latestStatus === 'success'){
                    link.classList.remove('disabled');
                    viewlink.classList.remove('disabled');
                }else{
                    link.classList.add('disabled');
                    viewlink.classList.add('disabled');
                }
        }
    });
    fragmen.onDraw(() => {
        let freq = 0.0;

        if(freq > 0.0){
            fragmen.setFrequency(freq);
        }
    });
    // デフォルトのメッセージを出力
    counter.textContent = `${currentSource.length}`;
    message.textContent = ' ● ready';
    // レンダリング開始
    fragmen.mode = currentMode;
    fragmen.render(currentSource);

    // WebGL 2.0 に対応しているかどうかによりドロップダウンリストの状態を変更
    if(fragmen.isWebGL2 !== true){
        for(let i = 0; i < mode.children.length; ++i){
            mode.children[i].disabled = Fragmen.MODE_WITH_ES_300.includes(i);
        }
    }

    window.addEventListener('keydown', (evt) => {
        // vim mode
        if(
            ((evt.ctrlKey === true || evt.metaKey === true) && evt.altKey === true) &&
            (evt.key === 'v' || evt.key === 'V' || evt.key === '√')
        ){
            vimMode = !vimMode;
            if(vimMode === true){
                editor.setKeyboardHandler('ace/keyboard/vim');
            }else{
                editor.setKeyboardHandler(null);
            }
        }
        if((evt.ctrlKey === true || evt.metaKey === true) && evt.altKey === true && (evt.key === '†' || evt.key === 't')){
            toggleEditorView();
        }
        if((evt.ctrlKey === true || evt.metaKey === true) && evt.altKey === true && (evt.key === '≤' || evt.key === ',')){
            --editorFontSize;
            document.querySelector('#editor').style.fontSize = `${editorFontSize}px`;
        }
        if((evt.ctrlKey === true || evt.metaKey === true) && evt.altKey === true && (evt.key === '≥' || evt.key === '.')){
            ++editorFontSize;
            document.querySelector('#editor').style.fontSize = `${editorFontSize}px`;
        }
        
    }, false);

    // フルスクリーン解除時に DOM を元に戻すためのリスナー
    const onFullscreenChange = (evt) => {
        if(
            document.FullscreenElement == null &&
            document.webkitFullscreenElement == null &&
            document.msFullscreenElement == null
        ){
            // すべての要素が null だった場合、DOM 操作を行いエディタを表示させる
            exitFullscreenMode();
        }
    };
    // F11 ではなく、意図的なショートカットキー操作によってフルスクリーンへと移行するためのリスナー
    const onFullscreenKeyDown = (evt) => {
        if(evt.altKey === true && evt.ctrlKey === true && (evt.key.toLowerCase() === 'f' || evt.key === 'ƒ')){
            if(
                document.FullscreenElement != null ||
                document.webkitFullscreenElement != null ||
                document.msFullscreenElement != null
            ){
                // この場合、絶対に JavaScript から fullscreen 化しているので強制的に戻せばよい
                // ただし、イベントリスナーによって事後処理が自動的に行われることになるので
                // 発火するのは document.exitFullsScreen までで、DOM はここでは操作しない
                exitFullscreen();
            }else{
                // この場合、F11 で既に見た目上は fullscreen 化している可能性がある
                // F11 の fullscreen は requestFullscreen 等で fullscreen 化したものとは
                // 別物として扱われているが、いずれも Escape で解除できるため注意
                requestFullscreenMode();
            }
        }
    };
    // アイコンが押されたとき
    const onFullscreenRequest = () => {
        if(
            document.FullscreenElement == null ||
            document.webkitFullscreenElement == null ||
            document.msFullscreenElement == null
        ){
            requestFullscreenMode();
        }
    };
    // API がサポートされている場合に限りフルスクリーン関連のリスナーを登録する
    if(document.fullscreenEnabled === true){
        document.addEventListener('fullscreenchange', onFullscreenChange, false);
        window.addEventListener('keydown', onFullscreenKeyDown, false);
        fullIcon.addEventListener('click', onFullscreenRequest, false);
    }else if(document.webkitFullscreenEnabled === true){
        document.addEventListener('webkitfullscreenchange', onFullscreenChange, false);
        window.addEventListener('keydown', onFullscreenKeyDown, false);
        fullIcon.addEventListener('click', onFullscreenRequest, false);
    }else{
        // いずれでもない場合は API でフルスクリーン化することができないのでアイコンを消す
        fullIcon.classList.add('nevershow');
    }

    // information アイコンが押されたとき
    infoIcon.addEventListener('click', () => {
        const wrap = document.createElement('div');

        const infoHeader = document.createElement('h3');
        infoHeader.textContent = 'Information';
        const infoCaption = document.createElement('div');
        infoCaption.textContent = 'This is a shader viewer and editor based on twigl.app. The main use of this is for NFTs that utilize shaders.';
        wrap.appendChild(infoHeader);
        wrap.appendChild(infoCaption);


        const sourceHeader = document.createElement('h3');
        sourceHeader.textContent = 'Based On';
        const sourceCaption = document.createElement('div');
        const sourceAnchor = document.createElement('a');
        sourceAnchor.textContent = 'twigl.app';
        sourceAnchor.setAttribute('href', 'https://twigl.app');
        sourceAnchor.setAttribute('target', '_blank');
        sourceCaption.appendChild(sourceAnchor);
        wrap.appendChild(sourceHeader);
        wrap.appendChild(sourceCaption);

        showDialog(wrap, {
            okVisible: true,
            cancelVisible: false,
            okLabel: 'close',
        });
    }, false);

    // hide menu
    hideIcon.addEventListener('click', () => {
        toggleLayerView();
    }, false);

    // toggle menu
    menuIcon.addEventListener('click', () => {
        toggleEditorView();
    }, false);


    // メニュー及びエディタが非表示の場合（フルスクリーンとは異なる点に注意）
    if(isLayerHidden === true){toggleLayerView();}

}, false);

/**
 * ウィンドウリサイズ時の処理
 */
function resize(){
    const canvas = document.querySelector('#webgl');
    const bound = canvas.parentElement.getBoundingClientRect();
    canvas.width = bound.width;
    canvas.height = bound.height;
}

/**
 * レイヤービューの変更
 */
function toggleLayerView(){
    canvasWrap.classList.toggle('fullheight');
    editorWrap.classList.toggle('invisible');
    // fullIcon.classList.toggle('invisible');
    hideIcon.classList.toggle('hide');
    menuIcon.classList.toggle('invisible');
    editor.resize();
    resize();
    fragmen.rect();

    if(hideIcon.classList.contains('hide') === true){
        hideIcon.title = 'hide editor';
    }else{
        hideIcon.title = 'show editor';
    }
}

/**
 * エディタビューの変更
 */
function toggleEditorView(){
    const wrap = document.querySelector('#wrap');
    wrap.classList.toggle('overlay');
    editor.resize();
    resize();
    fragmen.rect();
}

/**
 * シェーダのソースを更新
 */
function update(source){
    if(fragmen == null){return;}
    fragmen.render(source);
}


/**
 * Ace editor の初期設定
 * @param {string} id - 対象となる DOM が持つ ID 属性
 * @param {string} source - 初期値として設定するソースコード
 * @param {function} onChange - change イベント用コールバック
 * @param {function} onSelectionChange - selection change イベント用コールバック
 * @param {string} [theme='chaos'] - テーマ
 */
function editorSetting(id, source, onChange, onSelectionChange, theme = 'chaos'){
    const edit = ace.edit(id);
    edit.setTheme(`ace/theme/${theme}`);
    edit.session.setOption('indentedSoftWrap', false);
    edit.session.setUseWrapMode(true);
    edit.session.setMode('ace/mode/glsl');
    edit.session.setTabSize(2);
    edit.session.setUseSoftTabs(true);
    edit.$blockScrolling = Infinity;
    edit.setShowPrintMargin(false);
    edit.setShowInvisibles(true);
    edit.setHighlightSelectedWord(true);
    edit.setValue(source);

    // editor の内容が変化した際のリスナーを設定
    edit.session.on('change', onChange);

    // editor 内で選択が変更した際のリスナーを設定
    edit.selection.on('changeSelection', onSelectionChange);

    // １行目にフォーカスしておく
    setTimeout(() => {edit.gotoLine(1);}, 100);
    return edit;
}

/**
 * GIF をキャプチャする
 * @param {number} [frame=180] - キャプチャするフレーム数
 * @param {number} [width=512] - キャプチャする際の canvas の幅
 * @param {number} [height=256] - キャプチャする際の canvas の高さ
 * @param {string} [format='gif'] - capture output format
 * @param {number} [framerate=60] - capture framerate
 * @param {number} [quality=100] - capture quality
 */
function captureAnimation(frame = 180, width = 512, height = 256, format = 'gif', framerate = 60, quality = 100){
    // CCapture の初期化
    const ccapture = new CCapture({
        verbose: false,
        format: format,
        workersPath: './js/',
        framerate: framerate,
        quality: quality,
        onProgress: (range) => {
            // 変換進捗の出力
            const p = Math.floor(range * 100);
            download.textContent = `${p}%`;
        },
    });

    // キャプチャ用の canvas の生成と設定
    let captureCanvas = document.createElement('canvas');
    // document 上に存在しないと WebGL 側で初期化に失敗する
    captureCanvas.width          = width;
    captureCanvas.height         = height;
    captureCanvas.style.position = 'absolute';
    captureCanvas.style.top      = '-9999px';
    captureCanvas.style.left     = '-9999px';
    document.body.appendChild(captureCanvas);
    const option = Object.assign(FRAGMEN_OPTION, {
        target: captureCanvas,
        eventTarget: captureCanvas,
    });
    // モードを揃えて新しい fragmen のインスタンスを生成
    let frag = new Fragmen(option);
    frag.mode = currentMode;
    // 引数の指定フレーム数分レンダリングし GIF を生成
    let frameCount = 0;
    frag.onDraw(() => {
        if(frameCount < frame){
            ccapture.capture(captureCanvas);
        }else{
            frag.run = false;
            ccapture.stop();
            ccapture.save((blob) => {
                setTimeout(() => {
                    // blob からダウンロードリンクを生成する
                    const url = URL.createObjectURL(blob);
                    let anchor = document.createElement('a');
                    document.body.appendChild(anchor);
                    anchor.download = `${uuid()}.${format}`;
                    anchor.href = url;
                    anchor.click();
                    document.body.removeChild(anchor);
                    document.body.removeChild(captureCanvas);
                    // 後始末をして UI を復帰させる
                    URL.revokeObjectURL(url);
                    download.classList.remove('disabled');
                    download.textContent = 'Download';
                    isEncoding = false;
                    captureCanvas = null;
                    frag = null;
                    anchor = null;
                }, 500);
            });
        }
        ++frameCount;
    });
    ccapture.start();
    frag.render(editor.getValue());
}


/**
 * searchParams を取得する
 * @return {URLSearchParams}
 */
function getParameter(){
    return new URL(document.location).searchParams;
}

/**
 * 現在の状態を再現するための URL パラメータを生成し短縮 URL を取得する
 * @return {string} - 短縮 URL を取得すると解決する Promise
 */
function generatePermamentLink(){
    let result = [];
    if(latestStatus === 'success'){
        result.push(`ol=true`);
        result.push(`mode=${mode.value}`);
        result.push(`source=${encodeURIComponent(editor.getValue())}`);
    }
    if(result.length > 0){
            const param = result.join('&');
            const url = `${BASE_URL}?${param}`;
            return url
    }else{
        "";
    }
}
function generatePermamentViewLink(){
    let result = [];
    if(latestStatus === 'success'){
        result.push(`preview=true`);
        result.push(`mode=${mode.value}`);
        result.push(`source=${encodeURIComponent(editor.getValue())}`);
    }
    if(result.length > 0){
            const param = result.join('&');
            const url = `${BASE_URL}?${param}`;
            return url
    }else{
        "";
    }
}


/**
 * 自家製ダイアログを表示する
 * @param {string|HTMLElement} message - 表示するメッセージの文字列か append する DOM
 * @param {object}
 * @property {string} [okLabel='ok'] - ok ボタンに表示する文字列
 * @property {string} [cancelLabel='cancel'] - cancel ボタンに表示する文字列
 * @property {boolean} [okVisible=true] - ok ボタンを表示するかどうか
 * @property {boolean} [cancelVisible=true] - cancel ボタンを表示するかどうか


/**
 * 自家製ダイアログを表示する
 * @param {string|HTMLElement} message - 表示するメッセージの文字列か append する DOM
 * @param {object}
 * @property {string} [okLabel='ok'] - ok ボタンに表示する文字列
 * @property {string} [cancelLabel='cancel'] - cancel ボタンに表示する文字列
 * @property {boolean} [okVisible=true] - ok ボタンを表示するかどうか
 * @property {boolean} [cancelVisible=true] - cancel ボタンを表示するかどうか
 * @property {boolean} [okDisable=false] - ok ボタンに disabled を設定するかどうか
 * @property {boolean} [cancelDisable=false] - cancel ボタンに disabled を設定するかどうか
 * @return {Promise} - ok, cancel のいずれかのボタンが押されたときに解決する Promise
 */
function showDialog(message, option){
    // ダイアログの各ボタンには、毎回イベントを設定してボタン押下時に解除する
    const dialogOption = Object.assign({
        okLabel: 'ok',
        cancelLabel: 'cancel',
        okVisible: true,
        cancelVisible: true,
        okDisable: false,
        cancelDisable: false,
    }, option);
    return new Promise((resolve) => {
        // ダイアログ上にメッセージを設定しレイヤを表示する
        while(dialog.firstChild != null){
            dialog.removeChild(dialog.firstChild);
        }
        // 文字列か DOM かによって分岐
        if(message instanceof HTMLElement === true){
            dialog.appendChild(message);
        }else{
            const sentence = message.split('\n');
            sentence.forEach((s) => {
                const div = document.createElement('div');
                div.textContent = s;
                dialog.appendChild(div);
            });
        }
        const ok = document.querySelector('#dialogbuttonok');
        const cancel = document.querySelector('#dialogbuttoncancel');
        // 表示されるラベルの設定
        ok.textContent = dialogOption.okLabel;
        cancel.textContent = dialogOption.cancelLabel;
        // 可視化するかどうかの設定
        if(dialogOption.okVisible === true){
            ok.classList.remove('invisible');
        }else{
            ok.classList.add('invisible');
        }
        if(dialogOption.cancelVisible === true){
            cancel.classList.remove('invisible');
        }else{
            cancel.classList.add('invisible');
        }
        // disabled かどうかとイベントの付与
        if(dialogOption.okDisable === true){
            ok.classList.add('disabled');
        }else{
            ok.classList.remove('disabled');
            const okClick = () => {
                ok.removeEventListener('click', okClick);
                resolve(true);
                hideDialog();
            };
            ok.addEventListener('click', okClick, false);
        }
        if(dialogOption.cancelDisable === true){
            cancel.classList.add('disabled');
        }else{
            cancel.classList.remove('disabled');
            const cancelClick = () => {
                cancel.removeEventListener('click', cancelClick);
                resolve(false);
                hideDialog();
            };
            cancel.addEventListener('click', cancelClick, false);
        }

        setLayerVisible(true);
    });
}

/**
 * ダイアログ（及びレイヤ）を非表示にする
 */
function hideDialog(){
    setLayerVisible(false);
}

/**
 * フロートレイヤの表示状態を設定する
 * @param {boolean} visible - 表示するかどうかのフラグ
 */
function setLayerVisible(visible){
    if(visible === true){
        layer.classList.add('visible');
    }else{
        layer.classList.remove('visible');
    }
}

/**
 * フルスクリーンを解除する（DOM 操作はしない）
 */
function exitFullscreen(){
    if(
        document.fullscreenEnabled !== true &&
        document.webkitFullscreenEnabled !== true
    ){
        return;
    }
    // 一度変数にキャッシュしたりすると Illegal invocation になるので直接呼ぶ
    if(document.exitFullsScreen != null){
        document.exitFullscreen();
    }else if(document.webkitExitFullscreen != null){
        document.webkitExitFullscreen();
    }
}

/**
 * フルスクリーンを解除後の DOM 操作とエディタ領域のリサイズのみを行う
 */
function exitFullscreenMode(){
    canvasWrap.classList.remove('fullscreen');
    editorWrap.classList.remove('invisible');
    iconColumn.classList.remove('invisible');
    editor.resize();
    resize();
    fragmen.rect();
}

/**
 * フルスクリーンモードへ移行しエディタ領域をリサイズする
 */
function requestFullscreenMode(){
    if(
        document.fullscreenEnabled !== true &&
        document.webkitFullscreenEnabled !== true
    ){
        return;
    }
    // 一度変数にキャッシュしたりすると Illegal invocation になるので直接呼ぶ
    if(document.body.requestFullscreen != null){
        document.body.requestFullscreen();
        canvasWrap.classList.add('fullscreen');
        editorWrap.classList.add('invisible');
        iconColumn.classList.add('invisible');
    }else if(document.body.webkitRequestFullScreen != null){
        document.body.webkitRequestFullScreen();
        canvasWrap.classList.add('fullscreen');
        editorWrap.classList.add('invisible');
        iconColumn.classList.add('invisible');
    }
    editor.resize();
    resize();
    fragmen.rect();
}

/**
 * 引数から受け取った文字列をクリップボードにコピーする
 * @param {string} str - コピーしたい文字列
 */
function copyToClipboard(str){
    // textarea を生成して値を設定し文字列選択でコマンド発行
    const t = document.createElement('textarea');
    t.value = str;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    // body 配下から削除
    document.body.removeChild(t);
}

/**
 * uuid を生成する
 * @return {string}
 */
function uuid(){
    // https://github.com/GoogleChrome/chrome-platform-analytics/blob/master/src/internal/identifier.js
    const chars = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.split('');
    for(let i = 0, j = chars.length; i < j; i++){
        switch(chars[i]){
            case 'x':
                chars[i] = Math.floor(Math.random() * 16).toString(16);
                break;
            case 'y':
                chars[i] = (Math.floor(Math.random() * 4) + 8).toString(16);
                break;
        }
    }
    return chars.join('');
}

})();
