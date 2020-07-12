const mysql = require('mysql');
/**
 * Estructura de la tabla de usuarios:
 * +--------+---------------+-----------+---------+------------+
 * |  id    | nombreusuario | password  | nombre  | apellidos  |
 * +--------+---------------+-----------+---------+------------+
 * |   1    |    admin      |   admin   |Administrador| usuario|
 * |   2    |    sergio     |   123456  | Sergio  |  Caballero |
 * +--------+---------------+-----------+---------+------------+
 */
// Conexión a la base de datos
//parámetros de la conexión
var con = mysql.createConnection({
    host: "localhost",
    port: 3306,
    user: "root",
    password: "root",
    database: "presentacionvirtual"
});
con.connect(function (err) {
    if (err) {
        console.error("Error en la conexión a la Base de datos")
        throw err;}
    console.log("Conectado a la base de datos");

});

/**
 * Crear un nuevo usuario
 * @param {*} usuario 
 * @param {*} password 
 * @param {*} nombre 
 * @param {*} apellidos 
 */
function adduser(usuario, password, nombre, apellidos) {

    var sql = 'INSERT INTO usuarios (nombreusuario, password, nombre, apellidos) '
        + `VALUES ('${usuario}','${password}','${nombre}','${apellidos}');`;
    //console.log(sql);
    //añadir a la base de datos
    con.query(sql, function (err, result) {
        if (err) throw err;
        console.log("Se ha añadido el usuario, ID: " + result.insertId);
    });
}

/**
 * Busca un usuario a partir de su nombre de usuario
 * @param {*} usuario 
 */
function buscausuario(usuario) {

    return new Promise(function (resolve, reject) {
        var sql = `SELECT * FROM usuarios WHERE nombreusuario='${usuario}';`;
        con.query(sql, function (err, result, fields) {
            if (err) {
                reject(err);
            } else if (result == ''){
                reject('No se encuentra el usuario!');
            } else {
                var usuario = {
                    id: result[0].idusuario,
                    nombreusuario: result[0].nombreusuario,
                    password: result[0].password,
                    nombre: result[0].nombre,
                    apellidos: result[0].apellidos
                };
                resolve(usuario);
            }
        });
    });

}

//con.end((error)=>{console.log(error);}); //finaliza la conexión
//Declaración de las funciones
module.exports = {
    buscausuario: buscausuario
};