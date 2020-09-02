/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

/** Variables */
var socket = io();
//Variables pdf y html
var container = document.getElementById("pageContainer");
var divqr = document.getElementById("div_qr");
var divpdf = document.getElementById("div_pdfviwer");
//Variables de la sesión
var usuario = document.getElementById("usuario").innerHTML;
var sesion = document.getElementById("nombreSocketRoom").innerHTML;
var presentacion = document.getElementById("presentacion").innerHTML;
var DEFAULT_URL = '/private/' + usuario + '/' + presentacion;

console.log("Conectado LEERPDF.JS; Sesion: " + sesion + '\r\n' + DEFAULT_URL);
divpdf.style.display = "none"; //oculto
divqr.style.display = "block"; //visible

/** Visualizar pdf */
if (!pdfjsLib.getDocument || !pdfjsViewer.PDFPageView) {
    alert("Please build the pdfjs-dist library using\n  `gulp dist-install`");
}

// The workerSrc property shall be specified.
//
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf-reader/build/pdf.worker.js";

// Some PDFs need external cmaps.
//
var CMAP_URL = "/pdf-reader/cmaps/";
var CMAP_PACKED = true;

//var DEFAULT_URL = "../private/admin/example.pdf";
var PAGE_TO_VIEW = 1;
var SCALE = 0.9;
var pdfDoc;

var eventBus = new pdfjsViewer.EventBus();

// Loading document.
var loadingTask = pdfjsLib.getDocument({
    url: DEFAULT_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: CMAP_PACKED,
});
//Inicio
loadingTask.promise.then(function (pdfDocument){
    pdfDoc = pdfDocument;
    render();
});

/**
 * Carga la página pdf en html con las variables locales modificables 
 * de página y zoom
 */
function render() {
    loadingTask.promise.then(function (pdfDocument) {
        container.innerHTML = '';
        // Document loaded, retrieving the page.
        return pdfDocument.getPage(PAGE_TO_VIEW).then(function (pdfPage) {
            console.log('render: ' + PAGE_TO_VIEW);
            // Creating the page view with default parameters.
            var pdfPageView = new pdfjsViewer.PDFPageView({
                container: container,
                id: PAGE_TO_VIEW,
                scale: SCALE,
                defaultViewport: pdfPage.getViewport({ scale: SCALE }),
                eventBus: eventBus,
                // We can enable text/annotations layers, if needed
                textLayerFactory: new pdfjsViewer.DefaultTextLayerFactory(),
                annotationLayerFactory: new pdfjsViewer.DefaultAnnotationLayerFactory(),
            });
            // Associates the actual page with the view, and drawing it
            pdfPageView.setPdfPage(pdfPage);
            return pdfPageView.draw();
        });
    });

}//fin function


/** Funcionamiento socket */
//TODO scroll
/**
 * Cambia de página comprobando que la nueva está en los límites del documento
 */
function cambiapagina(pagina) {
    console.log("function cambiapagina");
    if (pdfDoc == null || PAGE_TO_VIEW > pdfDoc.numPages || PAGE_TO_VIEW < 1) {
        console.error("Petición de página inválida!");
        return;
    } else {
        PAGE_TO_VIEW = pagina;
        document.getElementById("current_page").value = PAGE_TO_VIEW;
        render();
    }
}
var pagina = 0;
var peticAnterior=0;
socket.on(sesion, function (msg) {
    var peticNueva = Date.now();
    var user = msg.usuario;
    var diferencia = peticNueva-peticAnterior; //Para comprobar que no se realizan varias peticiones seguidas
    console.log('('+peticNueva+', '+diferencia+')socket id :' + socket.id 
        + ' mensaje: ' + msg + ' usuario recibido:' + user);//muestra el id del socket
    
    if (user == usuario && diferencia >= 1000) {
        switch (msg.mensaje) {
            case "OK":
                divpdf.style.display = "block"; // block: mostrar
                divqr.style.display = "none"; //none: ocultar;
                break;
            case "pmas":
                pagina = PAGE_TO_VIEW + 1;
                cambiapagina(pagina);
                break;
            case "pmenos":
                pagina = PAGE_TO_VIEW - 1;
                cambiapagina(pagina);
                break;
            case "zmas":
                SCALE += 0.1;
                render();
                break;
            case "zmenos":
                SCALE -= 0.1;
                render();
                break;
            case "FIN":
                console.log("SE HA DESCONECTADO UN USUARIO"); //TODO probar que se cierra solo con la propia sesión
                divpdf.style.display = "none"; //oculto
                divqr.style.display = "block"; //visible
                break;
            default:
                //TODO emitir error ¿?
                break;
        }
        peticAnterior = peticNueva;
    }    
});